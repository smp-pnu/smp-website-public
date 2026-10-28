import { guardUploadDeletion, cmsMaintenance } from "../cms/maintenance"
import { cmsApi, cmsExport } from "../cms/api"
import { Buffer } from "node:buffer"
import type { Database } from "../cloudflare/bindings"
import { HttpError, idPattern, object } from "../admin-server/validation"
import { Passkeys, type AuthEnv } from "./auth"
import { StepUp } from "./step-up"
import { Sessions } from "./session"
import { chunkBytes, sha256 } from "./protocol"
import { CloudStore } from "./store"
import { validateCover } from "./files"
import { extractMetadata, type AiBinding } from "./ai-metadata"
import { LibraryStore } from "./library"
import { NoticeStore } from "./notices"
import { ContentOrderStore } from "./content-order"
import { ReportVersions } from "./report-versions"
import { DriveConnection, type DriveFetch } from "./drive/connection"
import { DriveUploads } from "./drive/uploads"
import { publicationExport } from "./publication-export"
import { dashboardData, driveCapacity } from "./dashboard"
import { dashboardSnapshot } from "./dashboard-cache"
import { readCloudUsage } from "../cms/cloudflare-usage"

export interface Env extends AuthEnv {
  CMS_DB?: Database
  ADMIN_DB: Database
  ASSETS: { fetch(request: Request): Promise<Response> }
  ORIGIN: string
  AI?: AiBinding
  DRIVE_ACCOUNT_EMAIL?: string
  REPORT_EXPORT_KEY?: string
  REPORT_EXPORT_SCOPE?: string
}
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https://pnusmp.com blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
}
async function bodyBytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new HttpError(413, "전송 크기가 너무 커요.")
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, "전송 내용이 없어요.")
  const parts: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const value = await reader.read()
      if (value.done) break
      bytes += value.value.byteLength
      if (bytes > max) {
        await reader.cancel()
        throw new HttpError(413, "전송 크기가 너무 커요.")
      }
      parts.push(value.value)
    }
  } finally {
    reader.releaseLock()
  }
  return new Uint8Array(Buffer.concat(parts, bytes))
}
async function jsonBody(request: Request, max = 48 * 1024) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON 요청이 필요해요.")
  try {
    return JSON.parse(new TextDecoder().decode(await bodyBytes(request, max)))
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, "요청 내용을 확인해 주세요.")
  }
}
const json = (data: unknown, status = 200) => Response.json(data, { status })
export function createHandler(clock = Date.now, driveFetch: DriveFetch = fetch) {
  return async (request: Request, env: Env) => {
    let response: Response
    try {
      const url = new URL(request.url)
      if (url.protocol !== "https:" || url.origin !== env.ORIGIN)
        throw new HttpError(403, "허용되지 않은 시험 사이트 주소예요.")
      const mutation = !["GET", "HEAD"].includes(request.method)
      if (
        mutation &&
        (request.headers.get("origin") !== env.ORIGIN ||
          request.headers.get("sec-fetch-site") === "cross-site")
      )
        throw new HttpError(403, "다른 출처의 요청은 허용하지 않아요.")
      if (!url.pathname.startsWith("/api/")) {
        if (mutation) throw new HttpError(404, "페이지를 찾지 못했어요.")
        response =
          url.pathname === "/robots.txt"
            ? new Response("User-agent: *\nDisallow: /\n", {
                headers: { "Content-Type": "text/plain" },
              })
            : await env.ASSETS.fetch(request)
      } else {
        const now = clock(),
          connection = new DriveConnection(env, now, driveFetch),
          drive = new DriveUploads(connection)
        // OAuth redirects cannot carry our SameSite=Strict login cookie. The
        // one-time PKCE state only creates a pending grant; a signed-in CSRF-
        // protected confirmation is still required before any Drive writes.
        const authResponse = url.pathname.startsWith("/api/cms-export/")
            ? await cmsExport(request,env,drive,now)
            : url.pathname.startsWith("/api/publisher/")
            ? await publicationExport(request,env,drive,now)
            : url.pathname === "/api/storage/drive/callback" && request.method === "GET"
            ? await connection.callback(url)
            : await new Passkeys(env, now).handle(request, () => jsonBody(request))
        if (authResponse) {
          response = authResponse
        } else {
          const session = await new Sessions(env, now).identity(request),
            store = new CloudStore(env.ADMIN_DB, now)
          if (mutation && request.headers.get("x-csrf-token") !== session.csrf)
            throw new HttpError(403, "요청 인증을 다시 확인해 주세요.")
          await store.budget()
          const path = url.pathname,
            method = request.method
          if (path === "/api/dashboard" && method === "GET") {
            if (!env.CMS_DB) throw new HttpError(409, "게시 관리 연결을 확인해 주세요.")
            response = json(await dashboardSnapshot(env.ADMIN_DB,"overview",60_000,()=>dashboardData(env.ADMIN_DB,env.CMS_DB!,now),now))
          } else if (path === "/api/dashboard/drive" && method === "GET") {
            response = json(await driveCapacity(connection))
          } else if (path === "/api/dashboard/cloudflare" && method === "GET") {
            if (!env.CMS_DB) throw new HttpError(409, "게시 관리 연결을 확인해 주세요.")
            response = json(await readCloudUsage(env.CMS_DB))
          } else if (path.startsWith("/api/cms/")) {
            response = await cmsApi(request,env,drive,()=>jsonBody(request,256*1024),max=>bodyBytes(request,max),now)
          } else if (path === "/api/storage/status" && method === "GET") {
            response = json({
              ...(await connection.status(session.username)),
              ...(await env.ADMIN_DB.prepare(
                `SELECT
              (SELECT count(*) FROM report_files WHERE state='pending-delete')+(SELECT count(*) FROM abandoned_drive_files) AS pendingCleanup,
              (SELECT count(*) FROM report_files WHERE state='pending-delete' AND last_error IS NOT NULL)+(SELECT count(*) FROM abandoned_drive_files WHERE last_error IS NOT NULL) AS cleanupErrors`,
              ).first()),
            })
          } else if (path === "/api/storage/drive/rotate" && method === "POST") {
            const data = object(await jsonBody(request))
            const state = await env.ADMIN_DB.prepare("SELECT value FROM admin_config WHERE key='recovery'").first<{value:string}>()
            await new StepUp(env.ADMIN_DB, now).consume(request, data.stepUpToken, state?.value ?? "", "drive:rotate")
            response = json(await connection.rotate(data.client))
          } else if (path === "/api/storage/drive/configure" && method === "POST")
            response = json(await connection.configure(await jsonBody(request)))
          else if (path === "/api/storage/drive/start" && method === "POST")
            response = json(await connection.start(session.username))
          else if (path === "/api/storage/drive/confirm" && method === "POST")
            response = json(await connection.confirm(session.username))
          else if (path === "/api/storage/drive/quota" && method === "GET")
            response = json(await connection.quota())
          else if (path === "/api/storage/maintenance" && method === "POST") {
            await cmsMaintenance(env,now)
            const lease = await env.ADMIN_DB.prepare(
              "INSERT INTO usage(key,hits,expires) VALUES('drive-maintenance',1,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE expires<=? RETURNING key",
            )
              .bind(now + 3600000, now)
              .first()
            response = json(
              lease && (await connection.grant())?.folderId
                ? await drive.cleanup(2)
                : { removed: 0, failed: 0 },
            )
          } else if (path === "/api/session" && method === "GET") {
            await store.cleanup()
            response = json({ setupRequired: false, session })
          } else if (path === "/api/drafts" && method === "GET") {
            await store.cleanup()
            response = json(await store.list())
          } else if (path === "/api/library/status" && method === "GET")
            response = json(await store.overview())
          else if (path === "/api/notices" && method === "GET") {
            await store.cleanup()
            response = json(await new NoticeStore(env.ADMIN_DB, now).list())
          } else if (path === "/api/notices" && method === "POST")
            response = json(
              await new NoticeStore(env.ADMIN_DB, now).create(await jsonBody(request)),
              201,
            )
          else if (path === "/api/notices/order" && method === "GET")
            response = json(await new ContentOrderStore(env.ADMIN_DB, "notices").order())
          else if (path === "/api/notices/order" && method === "PUT")
            response = json(await new ContentOrderStore(env.ADMIN_DB, "notices").reorder(await jsonBody(request)))
          else if (/^\/api\/notice-assets\/[^/]+$/.test(path) && method === "GET") {
            const id = path.split("/")[3]
            if (!idPattern.test(id)) throw new HttpError(400, "사진 번호를 확인해 주세요.")
            response = await new NoticeStore(env.ADMIN_DB, now).asset(id)
          } else if (/^\/api\/notices\/[^/]+(?:\/images)?$/.test(path)) {
            const [, , , id, asset] = path.split("/")
            if (!idPattern.test(id)) throw new HttpError(400, "공지 번호를 확인해 주세요.")
            const notices = new NoticeStore(env.ADMIN_DB, now)
            if (!asset && method === "GET") response = json(await notices.get(id))
            else if (!asset && method === "PATCH")
              response = json(await notices.change(id, await jsonBody(request)))
            else if (asset === "images" && method === "POST") {
              if (request.headers.get("content-type") !== "application/octet-stream")
                throw new HttpError(415, "사진 전송 형식을 확인해 주세요.")
              const bytes = await bodyBytes(request, 1024 * 1024)
              await new Sessions(env, clock()).identity(request)
              response = json(await notices.image(id, bytes), 201)
            } else throw new HttpError(404, "요청한 기능이 없어요.")
          } else if (path === "/api/reports/order" && method === "GET")
            response = json(await new LibraryStore(env.ADMIN_DB, now).order())
          else if (path === "/api/reports/order" && method === "PUT")
            response = json(
              await new LibraryStore(env.ADMIN_DB, now).reorder(await jsonBody(request)),
            )
          else if (path === "/api/reports/batch" && method === "POST") {
            const input=object(await jsonBody(request)),action=object(input.action)
            if(['trash','remove'].includes(String(action.type)))await guardUploadDeletion(env,Array.isArray(input.items)?input.items.map((v:unknown)=>String(object(v).id)):[])
            response=json(await new LibraryStore(env.ADMIN_DB,now).batch(input))
          }
          else if (path === "/api/metadata/extract" && method === "POST")
            response = json(
              await extractMetadata(await jsonBody(request), env.ADMIN_DB, env.AI, now),
            )
          else if (path === "/api/uploads" && method === "POST") {
            const input = await jsonBody(request),
              connected = !!(await connection.grant())?.folderId
            const started = await store.begin(input, session.username, connected)
            if ("id" in started && started.id) {
              const mode = await env.ADMIN_DB.prepare(
                "SELECT provider FROM report_storage WHERE object_id=?",
              )
                .bind(started.id)
                .first<{ provider: string }>()
              if (mode?.provider === "drive")
                await drive.begin(await store.stage(started.id, session.username), input)
            }
            response = json(started, 201)
          } else if (
            /^\/api\/drafts\/[^/]+\/release(?:\/(?:pdf|cover)(?:\/\d+)?)?$/.test(path) &&
            method === "GET"
          ) {
            const [, , , id, , asset, partText] = path.split("/")
            if (!idPattern.test(id)) throw new HttpError(404, "승인본을 찾지 못했어요.")
            const versions = new ReportVersions(env.ADMIN_DB, now),
              release = await versions.approved(id),
              file = release.file
            if (!asset) response = json({ draft: release.draft, publication: "trial-only" })
            else if (asset === "cover" && partText === undefined) {
              const cover = await versions.cover(file)
              response = new Response(cover, {
                headers: { "Content-Type": validateCover(cover, cover.length) },
              })
            } else if (asset === "pdf" && partText === undefined)
              response = json({
                parts: Math.ceil(file.pdf_bytes / chunkBytes),
                bytes: file.pdf_bytes,
                hash: file.identity,
              })
            else if (asset === "pdf" && partText !== undefined) {
              const part = Number(partText)
              if (
                !Number.isSafeInteger(part) ||
                part < 0 ||
                part >= Math.ceil(file.pdf_bytes / chunkBytes)
              )
                throw new HttpError(404, "파일 조각이 없어요.")
              const proof = (await versions.assetParts(file, "pdf", part))[0]
              if (!proof) throw new HttpError(503, "원본 검증 정보가 없어요.")
              const bytes =
                file.provider === "drive"
                  ? await drive.read(file, part)
                  : new Uint8Array(Buffer.from(proof.data, "base64"))
              if ((await sha256(bytes)) !== proof.hash)
                throw new HttpError(503, "보관된 원본과 파일 내용이 달라요.")
              response = new Response(bytes, {
                headers: {
                  "Content-Type": "application/octet-stream",
                  "Content-Disposition": "attachment",
                },
              })
            } else throw new HttpError(404, "요청한 기능이 없어요.")
          } else {
            const match = path.match(
              /^\/api\/(uploads|drafts)\/([^/]+)(?:\/(finish|pdf|cover)(?:\/(\d+))?)?$/,
            )
            if (!match || !idPattern.test(match[2]))
              throw new HttpError(404, "요청한 기능이 없어요.")
            const [, resource, id, asset, partText] = match
            if (resource === "uploads" && method === "DELETE" && !asset) {
              await store.cancel(id, session.username)
              response = json({ ok: true })
            } else if (
              resource === "uploads" &&
              method === "POST" &&
              asset === "finish" &&
              partText === undefined
            )
              response = json(await store.finish(id, session.username))
            else if (
              resource === "uploads" &&
              method === "PUT" &&
              ["pdf", "cover"].includes(asset) &&
              partText !== undefined
            ) {
              const kind = asset as "pdf" | "cover",
                row = await store.stage(id, session.username),
                part = Number(partText)
              const total = kind === "pdf" ? row.pdf_bytes : row.cover_bytes,
                expected = Math.min(chunkBytes, total - part * chunkBytes)
              if (!Number.isSafeInteger(part) || part < 0 || part >= Math.ceil(total / chunkBytes))
                throw new HttpError(400, "파일 조각 번호를 확인해 주세요.")
              if (request.headers.get("content-type") !== "application/octet-stream")
                throw new HttpError(415, "파일 전송 형식을 확인해 주세요.")
              const bytes = await bodyBytes(request, expected)
              if (bytes.length !== expected)
                throw new HttpError(400, "전송된 파일 크기가 맞지 않아요.")
              if (part === 0) {
                const start = Buffer.from(bytes.subarray(0, 16)).toString("latin1")
                if (kind === "pdf" && !/^%PDF-\d\.\d/.test(start))
                  throw new HttpError(400, "PDF 파일 헤더를 확인해 주세요.")
                if (kind === "cover") validateCover(bytes, total)
              }
              const hash = await sha256(bytes)
              // Validate access expiry again before a mutation after reading the body.
              await new Sessions(env, clock()).identity(request)
              const mode = await env.ADMIN_DB.prepare(
                "SELECT provider FROM report_storage WHERE object_id=?",
              )
                .bind(id)
                .first<{ provider: string }>()
              if (kind === "pdf" && mode?.provider === "drive")
                await drive.put(row, part, bytes, hash)
              // Drive originals are not copied into D1; only bounded EOF proof
              // tails, per-chunk hashes and covers are retained here.
              const data =
                kind === "pdf" && mode?.provider === "drive"
                  ? part >= Math.max(0, Math.ceil(total / chunkBytes) - 2)
                    ? bytes.slice(-2048)
                    : new Uint8Array()
                  : bytes
              await store.put(
                row,
                kind,
                part,
                Buffer.from(data).toString("base64"),
                bytes.length,
                hash,
              )
              response = json({ ok: true, hash })
            } else if (resource === "drafts" && method === "PATCH" && !asset) {
              const body = object(await jsonBody(request))
              if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1)
                throw new HttpError(400, "초안 버전을 확인해 주세요.")
              if(["trash","remove"].includes(String(object(body.command).type)))await guardUploadDeletion(env,[id])
              await store.change(id, Number(body.revision), body.command)
              response = json({ ok: true })
            } else if (resource === "drafts" && method === "GET" && asset === "pdf") {
              const row = await store.get(id)
              if (partText === undefined)
                response = json({
                  parts: Math.ceil(row.pdf_bytes / chunkBytes),
                  bytes: row.pdf_bytes,
                  hash: row.hash,
                })
              else {
                const part = Number(partText)
                if (
                  !Number.isSafeInteger(part) ||
                  part < 0 ||
                  part >= Math.ceil(row.pdf_bytes / chunkBytes)
                )
                  throw new HttpError(404, "파일 조각이 없어요.")
                const value = await env.ADMIN_DB.prepare(
                  "SELECT data,hash FROM chunks WHERE object_id=? AND kind='pdf' AND part=?",
                )
                  .bind(id, part)
                  .first<{ data: string; hash: string }>()
                if (!value) throw new HttpError(503, "파일 조각을 확인하지 못했어요.")
                const file = await new ReportVersions(env.ADMIN_DB, now).binding(id)
                const bytes =
                  file?.provider === "drive"
                    ? await drive.read(file, part)
                    : new Uint8Array(Buffer.from(value.data, "base64"))
                if ((await sha256(bytes)) !== value.hash)
                  throw new HttpError(503, "저장된 PDF 검증에 실패했어요. 파일을 확인해 주세요.")
                response = new Response(bytes, {
                  headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition": "attachment",
                  },
                })
              }
            } else if (
              resource === "drafts" &&
              method === "GET" &&
              asset === "cover" &&
              partText === undefined
            ) {
              await store.get(id)
              const parts = await store.parts(id, "cover", true)
              const cover = new Uint8Array(
                Buffer.concat(parts.map((p) => Buffer.from(p.data, "base64"))),
              )
              response = new Response(cover, {
                headers: { "Content-Type": validateCover(cover, cover.length) },
              })
            } else throw new HttpError(404, "요청한 기능이 없어요.")
          }
        }
      }
    } catch (e) {
      // Never log request bodies, PDFs, email, JWTs, or credentials.
      const cmsLimit = e instanceof Error && /SMP_CMS_(?:ENTRY|METADATA|ASSET)_LIMIT/.test(e.message)
      response = json(
        {
          error:
            cmsLimit
              ? "관리 자료의 무료 저장 한도에 도달했어요. 기존 게시물은 유지됩니다. 불필요한 자료를 정리해 주세요."
              : e instanceof HttpError
              ? e.message
              : "시험 서버에서 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
        },
        cmsLimit ? 413 : e instanceof HttpError ? e.status : 503,
      )
    }
    const result = new Response(response.body, response)
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value)
    return result
  }
}
export default { fetch: createHandler() }
