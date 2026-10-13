import { test } from "node:test"
import assert from "node:assert/strict"
import { lookupCompany } from "../lib/company-lookup"

test("company lookup decodes one entity layer and keeps nested entities literal", async t => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(String(input)).origin, "https://navercomp.wisereport.co.kr")
    assert.equal(init?.redirect, "error")
    return new Response('<span class="name"> A&amp;B &amp;quot; &quot;C&quot; &#39;D&#39;&nbsp;</span><dt>WICS : 반도체와반도체장비</dt>')
  })
  assert.deepEqual(await lookupCompany("005930"), { ticker: "005930", company: 'A&B &quot; "C" \'D\'', industry: "반도체와반도체장비" })
})

test("company lookup never requests unvalidated tickers", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("No request expected"))
  for (const ticker of ["005930&url=https://evil.test", "12345", "abcdef"]) assert.equal(await lookupCompany(ticker), null)
})
