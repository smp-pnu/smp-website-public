import { fixture } from "./fixture"
import app from "vinext/server/fetch-handler"

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
    const url = new URL(request.url)
    const local = ["localhost", "127.0.0.1"].includes(url.hostname)
    // Controls are intentionally available only on local fixture builds.
    if (url.pathname === "/__fixture" && local) {
      if (request.method === "POST") { Object.assign(fixture, await request.json()); return Response.json({ ok: true }) }
      return Response.json(fixture)
    }
    if (!local && (url.pathname.startsWith("/api/notion/") || url.pathname.startsWith("/api/cron/"))) {
      return new Response("Preview is read-only", { status: 404 })
    }
    const response = await app.fetch(request, env, ctx)
    const result = new Response(response.body, response)
    result.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
    return result
  },
}
