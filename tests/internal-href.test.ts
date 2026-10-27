import { test } from "node:test"
import assert from "node:assert/strict"
import { internalHref } from "../lib/internal-href"
import { siteSearchMatches } from "../lib/site-search-query"
test("search navigation rejects executable and external links, including encoded path escapes", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "/\\evil.example", "/%5Cevil.example", "/%2Fevil.example", " /research", "/\n/evil.example", "https://evil.example", "/%xx", null]) assert.equal(internalHref(href), null, String(href))
  for (const href of ["/research/abc123", "/search?q=%EB%B6%80%EC%82%B0", "/network?generation=40", "/achievements#awards-1"]) assert.equal(internalHref(href), href)
  assert.equal(siteSearchMatches([{title:"SMP",text:"",label:"",href:"javascript:alert(1)"},{title:"SMP",text:"",label:"",href:"/about"}],"SMP").length,1)
})
