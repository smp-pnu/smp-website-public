import path from "node:path"
import { readFile, stat } from "node:fs/promises"
import { createReadStream } from "node:fs"
import { Readable } from "node:stream"
import { AdminStore } from "./store"
import { Auth } from "./auth"
import { HttpError, object, idPattern } from "./validation"
import { jsonBody, validateUpload } from "./uploads"
export const securityHeaders = {
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
}
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers })
export function createAdminApplication(options: { root: string; origin: string; staticRoot?: string; now?: () => number }) {
  const origin = new URL(options.origin)
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.pathname !== "/") throw Error("The trial server only accepts the 127.0.0.1 loopback origin")
  const store = new AdminStore(options.root), auth = new Auth(store, options.now, origin.port)
  let uploadBusy = false
  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.origin !== origin.origin || (request.headers.has("host") && request.headers.get("host") !== origin.host)) throw new HttpError(403, "허용되지 않은 서버 주소예요.")
    if (!["GET", "HEAD"].includes(request.method)) {
      if (request.headers.get("origin") !== origin.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "다른 출처의 요청은 허용하지 않아요.")
    }
    if (url.pathname === "/api/session" && request.method === "GET") {
      const session = auth.session(request, false)
      return json({ setupRequired: !auth.admin(), session: session && { username: session.username, csrf: session.csrf } })
    }
    if (["/api/setup", "/api/login"].includes(url.pathname) && request.method === "POST") {
      const result = url.pathname.endsWith("setup") ? await auth.setup(await jsonBody(request)) : await auth.login(await jsonBody(request))
      return json(result.session, 200, { "Set-Cookie": result.cookie })
    }
    if (url.pathname.startsWith("/api/")) {
      auth.session(request)!
      if (!["GET", "HEAD"].includes(request.method)) { auth.verifyCsrf(request); store.rate("mutations", (options.now ?? Date.now)(), 120, 60_000) }
      if (url.pathname === "/api/logout" && request.method === "POST") return json({ ok: true }, 200, { "Set-Cookie": auth.logout(request) })
      if (url.pathname === "/api/drafts") {
        if (request.method === "GET") return json(store.list())
        if (request.method === "POST") {
          if (uploadBusy) throw new HttpError(429, "다른 PDF를 검증 중이에요. 완료 후 다시 시도해 주세요.")
          uploadBusy = true
          try {
            const input = await validateUpload(request)
            // Logout/expiry during a slow upload must revoke its write authority.
            auth.verifyCsrf(request); request.signal.throwIfAborted()
            return json(store.insert(input), 201)
          } finally { uploadBusy = false }
        }
      }
      const match = url.pathname.match(/^\/api\/drafts\/([^/]+)(?:\/(pdf|cover))?$/)
      if (match && idPattern.test(match[1])) {
        const [, id, asset] = match
        if (asset && ["GET", "HEAD"].includes(request.method)) {
          const draft = store.get(id), file = store.asset(id, asset as "pdf" | "cover"), info = await stat(file)
          auth.session(request) // Recheck after filesystem I/O.
          return new Response(request.method === "HEAD" ? null : Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: {
            "Content-Type": asset === "pdf" ? "application/pdf" : "image/webp", "Content-Length": String(info.size),
            ...(asset === "pdf" ? { "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(draft.filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}` } : {}),
          } })
        }
        if (!asset && request.method === "PATCH") {
          const input = object(await jsonBody(request)); auth.verifyCsrf(request)
          if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1) throw new HttpError(400, "초안 버전을 확인해 주세요.")
          store.change(id, Number(input.revision), input.command); return json({ ok: true })
        }
      }
      throw new HttpError(404, "요청한 기능이 없어요.")
    }
    if (!["GET", "HEAD"].includes(request.method) || !options.staticRoot) throw new HttpError(404, "페이지를 찾지 못했어요.")
    let relative: string
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") } catch { throw new HttpError(400, "잘못된 주소예요.") }
    if (relative.includes("\\") || relative.split("/").some(part => part.startsWith(".")) || relative.includes("\0")) throw new HttpError(404, "페이지를 찾지 못했어요.")
    const root = path.resolve(options.staticRoot)
    let file = path.join(root, relative || "index.html")
    if (!file.startsWith(root + path.sep)) throw new HttpError(404, "페이지를 찾지 못했어요.")
    const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".wasm": "application/wasm", ".bcmap": "application/octet-stream", ".ttf": "font/ttf", ".pfb": "application/octet-stream" }
    let data: Buffer
    try { data = await readFile(file) } catch { throw new HttpError(404, "페이지를 찾지 못했어요.") }
    return new Response(request.method === "HEAD" ? null : new Uint8Array(data), { headers: { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" } })
  }
  return { store, close: () => store.close(), async handle(request: Request) {
    let response: Response
    try { response = await route(request) }
    catch (error) {
      if (!(error instanceof HttpError)) console.error("Admin trial request failed", error instanceof Error ? error.name : "UnknownError")
      response = json({ error: error instanceof HttpError ? error.message : "서버에서 처리하지 못했어요. 잠시 후 다시 시도해 주세요." }, error instanceof HttpError ? error.status : 500)
    }
    for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value)
    return response
  } }
}
