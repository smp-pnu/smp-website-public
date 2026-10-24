import { createServer } from "node:http"
import { Readable } from "node:stream"
import { createAdminApplication } from "./app"
export function startAdminServer(root: string, staticRoot: string, port = 3013) {
  const origin = `http://127.0.0.1:${port}`
  const app = createAdminApplication({ root, staticRoot, origin })
  const server = createServer(async (incoming, outgoing) => {
    const abort = new AbortController()
    incoming.on("aborted", () => abort.abort())
    outgoing.on("close", () => { if (!outgoing.writableEnded) abort.abort() })
    try {
      const headers = new Headers()
      for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value)
      const method = incoming.method ?? "GET"
      const request = new Request(new URL(incoming.url ?? "/", origin), { method, headers, signal: abort.signal,
        ...(!["GET", "HEAD"].includes(method) ? { body: Readable.toWeb(incoming) as ReadableStream, duplex: "half" } : {}) } as RequestInit)
      const response = await app.handle(request)
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body) Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).on("error", () => outgoing.destroy()).pipe(outgoing)
      else outgoing.end()
    } catch { if (!outgoing.headersSent) outgoing.writeHead(400); outgoing.end() }
  })
  server.requestTimeout = 45_000; server.headersTimeout = 10_000; server.maxHeadersCount = 40; server.keepAliveTimeout = 5_000
  server.on("error", error => { console.error("Trial server could not listen:", (error as NodeJS.ErrnoException).code ?? error.name); app.close(); process.exitCode = 1 })
  server.listen(port, "127.0.0.1", () => console.log(`PDF ADMIN SERVER — ${origin}\nLocal server storage; no production connections. Setup key is in the private data directory.`))
  return { server, app, close: () => new Promise<void>((resolve, reject) => { server.close(error => { app.close(); error ? reject(error) : resolve() }); server.closeAllConnections() }) }
}
