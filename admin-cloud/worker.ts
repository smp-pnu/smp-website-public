import { Buffer } from "node:buffer"
import type { Database } from "../cloudflare/bindings"
import { HttpError, idPattern, object } from "../admin-server/validation"
import { Passkeys, type AuthEnv } from "./auth"
import { Sessions } from "./session"
import { chunkBytes, sha256 } from "./protocol"
import { CloudStore } from "./store"
import { validateCover } from "./files"
import { extractMetadata, type AiBinding } from "./ai-metadata"
import { LibraryStore } from "./library"
import { NoticeStore } from "./notices"

export interface Env extends AuthEnv {
  ADMIN_DB: Database
  ASSETS: { fetch(request: Request): Promise<Response> }
  ORIGIN: string
  AI?: AiBinding
}
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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
async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON 요청이 필요해요.")
  try {
    return JSON.parse(new TextDecoder().decode(await bodyBytes(request, 48 * 1024)))
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, "요청 내용을 확인해 주세요.")
  }
}
const json = (data: unknown, status = 200) => Response.json(data, { status })
export function createHandler(clock = Date.now) {
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
            ? new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } })
            : await env.ASSETS.fetch(request)
      } else {
        const now = clock(),
          authResponse = await new Passkeys(env, now).handle(request, () => jsonBody(request))
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
          if (path === "/api/session" && method === "GET") {
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
            response = json(await new NoticeStore(env.ADMIN_DB, now).create(await jsonBody(request)), 201)
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
            response = json(await new LibraryStore(env.ADMIN_DB, now).reorder(await jsonBody(request)))
          else if (path === "/api/reports/batch" && method === "POST")
            response = json(await new LibraryStore(env.ADMIN_DB, now).batch(await jsonBody(request)))
          else if (path === "/api/metadata/extract" && method === "POST")
            response = json(await extractMetadata(await jsonBody(request), env.ADMIN_DB, env.AI, now))
          else if (path === "/api/uploads" && method === "POST")
            response = json(await store.begin(await jsonBody(request), session.username), 201)
          else {
            const match = path.match(
              /^\/api\/(uploads|drafts)\/([^/]+)(?:\/(finish|pdf|cover)(?:\/(\d+))?)?$/,
            )
            if (!match || !idPattern.test(match[2])) throw new HttpError(404, "요청한 기능이 없어요.")
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
              if (bytes.length !== expected) throw new HttpError(400, "전송된 파일 크기가 맞지 않아요.")
              if (part === 0) {
                const start = Buffer.from(bytes.subarray(0, 16)).toString("latin1")
                if (kind === "pdf" && !/^%PDF-\d\.\d/.test(start))
                  throw new HttpError(400, "PDF 파일 헤더를 확인해 주세요.")
                if (kind === "cover") validateCover(bytes, total)
              }
              const hash = await sha256(bytes)
              // Validate access expiry again before a mutation after reading the body.
              await new Sessions(env, clock()).identity(request)
              await store.put(row, kind, part, Buffer.from(bytes).toString("base64"), bytes.length, hash)
              response = json({ ok: true, hash })
            } else if (resource === "drafts" && method === "PATCH" && !asset) {
              const body = object(await jsonBody(request))
              if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1)
                throw new HttpError(400, "초안 버전을 확인해 주세요.")
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
                if (!Number.isSafeInteger(part) || part < 0 || part >= Math.ceil(row.pdf_bytes / chunkBytes))
                  throw new HttpError(404, "파일 조각이 없어요.")
                const value = await env.ADMIN_DB.prepare(
                  "SELECT data FROM chunks WHERE object_id=? AND kind='pdf' AND part=?",
                )
                  .bind(id, part)
                  .first<{ data: string }>()
                if (!value) throw new HttpError(503, "파일 조각을 확인하지 못했어요.")
                response = new Response(new Uint8Array(Buffer.from(value.data, "base64")), {
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
              const cover = new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p.data, "base64"))))
              response = new Response(cover, {
                headers: { "Content-Type": validateCover(cover, cover.length) },
              })
            } else throw new HttpError(404, "요청한 기능이 없어요.")
          }
        }
      }
    } catch (e) {
      // Never log request bodies, PDFs, email, JWTs, or credentials.
      response = json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "시험 서버에서 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
        },
        e instanceof HttpError ? e.status : 503,
      )
    }
    const result = new Response(response.body, response)
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value)
    return result
  }
}
export default { fetch: createHandler() }
