import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequestGuard } from "../lib/request-security"
import { contentSecurityPolicy } from "../lib/content-security-policy"
import { isTrustedAttachmentUrl } from "../lib/pdf-source"
import { safeUrl } from "../lib/content-model"
const request = (headers: Record<string, string> = {}) => new Request("https://smp.test/api/search", { headers })
test("browser hotlinks fail before upstream work, direct navigation and same-origin work", () => {
  const guard = createRequestGuard()
  assert.equal(guard(request({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors" }), "cover")?.status, 403)
  assert.equal(guard(request({ "sec-fetch-site": "same-site", "sec-fetch-mode": "cors" }), "pdf")?.status, 403)
  assert.equal(guard(request({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" }), "pdf"), null)
  assert.equal(guard(request({ "sec-fetch-site": "same-origin" }), "pdf"), null)
})
test("instance limits refill and isolate resources; spoofed forwarded IPs cannot reset buckets", () => {
  let now = 0
  const guard = createRequestGuard(() => now, () => true)
  for (let i = 0; i < 600; i++) assert.equal(guard(request({ "x-vercel-forwarded-for": "192.0.2.1" }), "search"), null)
  const denied = guard(request({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "192.0.2.2" }), "search")!
  assert.equal(denied.status, 429)
  assert.equal(denied.headers.get("retry-after"), "1")
  assert.equal(guard(request({ "x-vercel-forwarded-for": "192.0.2.1" }), "cover"), null)
  now += 1000
  assert.equal(guard(request({ "x-vercel-forwarded-for": "192.0.2.1" }), "search"), null)
})
test("limiter retains throttled buckets when capacity is full, and expires idle buckets", () => {
  let now = 0
  const guard = createRequestGuard(() => now, () => true, 1)
  const first = request({ "x-vercel-forwarded-for": "192.0.2.1" })
  const second = request({ "x-vercel-forwarded-for": "192.0.2.2" })
  for (let i = 0; i < 600; i++) guard(first, "search")
  assert.equal(guard(second, "search")?.status, 429)
  assert.equal(guard(first, "search")?.status, 429)
  now += 121000
  assert.equal(guard(second, "search"), null)
})
test("production CSP disables inline handlers, eval, embedding and object execution", () => {
  const csp = contentSecurityPolicy("randomNonce123")
  assert.match(csp, /'nonce-randomNonce123'/)
  assert.match(csp, /script-src-attr 'none'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.doesNotMatch(csp.split(";")[1], /'unsafe-inline'|'unsafe-eval'/)
  assert.throws(() => contentSecurityPolicy("bad'; evil"))
})
test("first-party attachment redirects reject arbitrary origins and credentialed URLs", () => {
  assert.equal(isTrustedAttachmentUrl("https://drive.google.com/file/d/abcdefghijk123/view"), true)
  assert.equal(isTrustedAttachmentUrl("https://secure.notion-static.com/file.zip"), true)
  for (const url of ["https://evil.test/file.pdf", "https://drive.google.com.evil.test/file/d/abcdefghijk123", "https://user:pass@drive.google.com/file/d/abcdefghijk123", "http://secure.notion-static.com/file.pdf"]) assert.equal(isTrustedAttachmentUrl(url), false)
  assert.equal(safeUrl("http://example.com"), null)
})
