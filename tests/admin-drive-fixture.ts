import { createHash } from "node:crypto"
import type { DriveFetch } from "../admin-cloud/drive/connection"
import { driveScope } from "../admin-cloud/drive/connection"

type MockFile = {
  id: string
  name: string
  mimeType: string
  parents: string[]
  appProperties: Record<string, string>
  ownedByMe: boolean
  trashed: boolean
  permissions: { type: string; role: string }[]
  data: Uint8Array
}
export class MockDrive {
  files = new Map<string, MockFile>()
  sessions = new Map<string, { fileId: string; size: number; received: Uint8Array }>()
  calls: { method: string; url: string }[] = []
  email = "test@example.com"
  lossAfterWrite = false
  trashFailures = false
  quotaRemaining = 1024 * 1024 * 1024
  issued = 0
  metadata(file: MockFile) {
    return {
      ...file,
      data: undefined,
      size: String(file.data.length),
      sha256Checksum: createHash("sha256").update(file.data).digest("hex"),
    }
  }
  fetch: DriveFetch = async (input, init = {}) => {
    const url = new URL(input),
      method = init.method ?? "GET",
      headers = new Headers(init.headers)
    this.calls.push({ method, url: input })
    const json = (v: unknown, status = 200) => Response.json(v, { status })
    if (url.href === "https://oauth2.googleapis.com/token")
      return json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 3600,
        scope: driveScope,
      })
    if (url.origin !== "https://www.googleapis.com") throw Error("Unexpected destination")
    if (headers.get("authorization") !== "Bearer test-access") return json({}, 401)
    if (url.pathname === "/drive/v3/about")
      return json({
        user: { emailAddress: this.email },
        storageQuota: {
          limit: String(2 * 1024 ** 3),
          usage: String(2 * 1024 ** 3 - this.quotaRemaining),
        },
      })
    if (url.pathname === "/drive/v3/files/generateIds")
      return json({ ids: [`generated_file_${++this.issued}`] })
    if (url.pathname === "/drive/v3/files" && method === "GET")
      return json({
        files: [...this.files.values()]
          .filter((f) => f.mimeType === "application/vnd.google-apps.folder")
          .map((f) => ({ id: f.id })),
      })
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const data = JSON.parse(String(init.body)),
        id = `generated_folder_${++this.issued}`
      this.files.set(id, {
        ...data,
        id,
        ownedByMe: true,
        trashed: false,
        permissions: [{ type: "user", role: "owner" }],
        parents: [],
        data: new Uint8Array(),
      })
      return json({ id })
    }
    if (url.pathname.startsWith("/upload/drive/v3/files") && ["POST", "PATCH"].includes(method)) {
      const metadata = JSON.parse(String(init.body)),
        id = metadata.id ?? url.pathname.split("/").at(-1),
        key = `session_${++this.issued}`
      if (method === "POST")
        this.files.set(id, {
          ...metadata,
          id,
          ownedByMe: true,
          trashed: false,
          permissions: [{ type: "user", role: "owner" }],
          data: new Uint8Array(),
        })
      this.sessions.set(key, {
        fileId: id,
        size: Number(headers.get("X-Upload-Content-Length")),
        received: new Uint8Array(),
      })
      return new Response(null, {
        status: 200,
        headers: {
          location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${key}`,
        },
      })
    }
    if (url.pathname === "/upload/drive/v3/files" && method === "PUT") {
      const session = this.sessions.get(url.searchParams.get("upload_id") ?? "")
      if (!session) return json({}, 404)
      const range = headers.get("content-range") ?? ""
      if (!range.startsWith("bytes */")) {
        const match = range.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
        if (!match || Number(match[1]) !== session.received.length) return json({}, 400)
        const bytes = new Uint8Array(init.body as Uint8Array)
        session.received = new Uint8Array(Buffer.concat([session.received, bytes]))
        this.files.get(session.fileId)!.data = session.received
        if (this.lossAfterWrite) {
          this.lossAfterWrite = false
          throw new TypeError("simulated connection loss after Google accepted bytes")
        }
      }
      return session.received.length === session.size
        ? json(this.metadata(this.files.get(session.fileId)!))
        : new Response(null, {
            status: 308,
            headers: session.received.length
              ? { range: `bytes=0-${session.received.length - 1}` }
              : {},
          })
    }
    if (url.pathname.startsWith("/drive/v3/files/")) {
      const file = this.files.get(url.pathname.split("/").at(-1)!)
      if (!file) return json({}, 404)
      if (method === "PATCH") {
        if (this.trashFailures) return json({}, 503)
        const data = JSON.parse(String(init.body))
        if (Object.keys(data).join() !== "trashed" || data.trashed !== true)
          throw Error("Unexpected Drive mutation")
        file.trashed = true
        return json({ id: file.id, trashed: true })
      }
      if (url.searchParams.get("alt") === "media") {
        const range = headers.get("Range")?.match(/^bytes=(\d+)-(\d+)$/)
        if (!range) return json({}, 400)
        const start = Number(range[1]),
          end = Number(range[2])
        return new Response(file.data.slice(start, end + 1), {
          status: 206,
          headers: { "Content-Range": `bytes ${start}-${end}/${file.data.length}` },
        })
      }
      return json(this.metadata(file))
    }
    throw Error("Unexpected Google API path")
  }
}
