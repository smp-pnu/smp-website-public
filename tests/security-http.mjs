// Run against the local production build with tests/scale-fixture.mjs loaded.
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:3210'
const first = await fetch(base)
const policy = first.headers.get('content-security-policy')
assert.ok(policy?.includes("script-src-attr 'none'"))
assert.equal(first.headers.get('x-content-type-options'), 'nosniff')
assert.equal(first.headers.get('x-frame-options'), 'DENY')
assert.equal(first.headers.get('x-powered-by'), null)
const nonce = policy.match(/'nonce-([^']+)'/)[1]
const html = await first.text()
const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(match => match[0])
assert.ok(scripts.length > 0)
assert.ok(scripts.every(script => script.includes(`nonce="${nonce}"`)), 'Every initial script must carry the request nonce')
const second = await fetch(base, { headers: { 'x-nonce': 'attacker', 'content-security-policy': "script-src 'nonce-attacker'" } })
assert.notEqual(second.headers.get('content-security-policy'), policy)
assert.ok(!second.headers.get('content-security-policy').includes('attacker'))
await second.body.cancel()
const response = await fetch(`${base}/api/search`)
assert.equal(response.status, 200)
const index = await response.json()
assert.equal(index.partial, false)
assert.equal(index.entries.filter(entry => entry.label === '리포트').length, 600)
assert.equal(index.entries.filter(entry => entry.label === '공지').length, 300)
for (const entry of index.entries) {
  assert.deepEqual(Object.keys(entry).sort(), ['href', 'label', 'text', 'title'])
  assert.match(entry.href, /^\/(?!\/)/)
}
assert.ok(!JSON.stringify(index).includes('drive.google.com'))
const cover = `${base}/api/content/research/a0000000000000000000000000000001/cover`
assert.equal((await fetch(cover, { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' } })).status, 403)
const pdf = await fetch(`${base}/api/content/research/a0000000000000000000000000000001/pdf?source=external&download=1`)
assert.equal(pdf.status, 200)
assert.ok((await pdf.text()).startsWith('%PDF-'))
assert.match(pdf.headers.get('content-disposition'), /^attachment;/)
const unsigned = await fetch(`${base}/api/notion/webhook`, { method: 'POST', body: JSON.stringify({ type: 'page.deleted', entity: { type: 'page', id: 'a'.repeat(32) } }) })
assert.equal(unsigned.status, 401)
console.log('PASS: fresh CSP nonces, script nonces, security headers, public search projection, hotlink denial, PDF download and unsigned webhook rejection')
