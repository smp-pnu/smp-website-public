import { test } from "node:test"
import assert from "node:assert/strict"
import { ApiError, peekApi, readApi, SEARCH_CACHE_TTL } from "../lib/client-api-cache"

test("search suggestions and the full results share a bounded, recoverable response", async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now
  let now = originalNow(), requests = 0
  const path = "/api/search"
  const complete = { entries: [{ title: "인바디" }], partial: false }
  let response: () => Response = () => Response.json(complete)
  globalThis.fetch = (async () => { requests++; return response() }) as typeof fetch
  Date.now = () => now
  try {
    const [suggestions, results] = await Promise.all([readApi(path, SEARCH_CACHE_TTL), readApi(path, SEARCH_CACHE_TTL)])
    assert.deepEqual(suggestions, complete)
    assert.deepEqual(results, complete)
    assert.equal(requests, 1, "opening results during suggestions must share the request")
    assert.deepEqual(peekApi(path, SEARCH_CACHE_TTL), complete, "a results page renders immediately from suggestions")
    now += SEARCH_CACHE_TTL - 1
    await readApi(path, SEARCH_CACHE_TTL)
    assert.equal(requests, 1)
    now++
    assert.equal(peekApi(path, SEARCH_CACHE_TTL), undefined, "reads do not prolong freshness")

    response = () => Response.json({ entries: [], partial: true })
    await readApi(path, SEARCH_CACHE_TTL)
    assert.equal(peekApi(path, SEARCH_CACHE_TTL), undefined, "an incomplete index must be retried on the next visit")
    response = () => new Response(null, { status: 429, headers: { "Retry-After": "30" } })
    await assert.rejects(readApi(path, SEARCH_CACHE_TTL), error => error instanceof ApiError && error.status === 429)
    const limitedRequests = requests
    await assert.rejects(readApi(path, SEARCH_CACHE_TTL), ApiError)
    assert.equal(requests, limitedRequests, "reopening the search panel must honor server backoff")
    now += 30_000
    response = () => Response.json(complete)
    assert.deepEqual(await readApi(path, SEARCH_CACHE_TTL), complete)
    assert.equal(requests, limitedRequests + 1)
  } finally {
    globalThis.fetch = originalFetch
    Date.now = originalNow
  }
})
