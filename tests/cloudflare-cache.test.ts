import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import createDataCache from "../cloudflare/data-cache"
import type { Database, Statement } from "../cloudflare/bindings"
import { singleFlight } from "../lib/single-flight"

test("concurrent cache operations coalesce and rejected operations can retry", async () => {
  const run = singleFlight<number>()
  let calls = 0
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const jobs = Array.from({ length: 100 }, () => run("same", async () => { calls++; await waiting; return 42 }))
  await Promise.resolve()
  assert.equal(calls, 1)
  release()
  assert.deepEqual(await Promise.all(jobs), Array(100).fill(42))
  await assert.rejects(run("same", async () => { throw new Error("temporary") }))
  assert.equal(await run("same", async () => 43), 43)
})

test("D1 data cache expires old entries and removes tagged data, never HTML", async () => {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(readFileSync(new URL("../cloudflare/migrations/0001_cms.sql", import.meta.url), "utf8"))
  const prepare = (query: string, values: unknown[] = []): Statement => ({
    bind: (...args) => prepare(query, args),
    async first<T>() { return (sqlite.prepare(query).get(...values as any[]) ?? null) as T | null },
    async all<T>() { return { results: sqlite.prepare(query).all(...values as any[]) as T[] } },
    async run() { return sqlite.prepare(query).run(...values as any[]) },
  })
  const db: Database = { prepare, batch: async statements => Promise.all(statements.map(statement => statement.run())) }
  const cache = createDataCache({ env: { CMS_DB: db } })
  try {
    const value = { kind: "FETCH" as const, data: { headers: {}, body: JSON.stringify({ items: [1, 2] }), url: "" }, revalidate: 60, tags: ["published"] }
    assert.equal(await cache.get("catalog"), null)
    await cache.set("catalog", value)
    assert.deepEqual((await cache.get("catalog"))?.value, value)
    await cache.revalidateTag("unrelated")
    assert.ok(await cache.get("catalog"))
    await cache.revalidateTag("published")
    assert.equal(await cache.get("catalog"), null)
    await cache.set("catalog", value)
    sqlite.prepare("UPDATE content_cache SET expires_at = 0").run()
    assert.equal(await cache.get("catalog"), null)
    await assert.rejects(cache.set("private-html", { kind: "APP_PAGE" } as any), /Only data/)
    assert.equal(await cache.get("private-html"), null)
  } finally { sqlite.close() }
})
