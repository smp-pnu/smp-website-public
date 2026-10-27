import assert from "node:assert/strict"
import { test } from "node:test"
import { insertDraft } from "../admin-lab/cloud-storage"
import { api, setApiSession } from "../admin-lab/server-storage"
import { emptyFields, type Draft } from "../admin-lab/model"
import { chunkBytes } from "../admin-cloud/protocol"

const draft: Draft = { id: "test", hash: "a".repeat(64), filename: "test.pdf", fileBytes: chunkBytes + 9, storedBytes: chunkBytes + 19, pages: 3,
  fields: emptyFields(), evidence: [], warnings: [], revision: 1, approvedRevision: null, approvedAt: null, createdAt: "", updatedAt: "", trashedAt: null }
const assets = { id: draft.id, pdf: new Blob([new Uint8Array(draft.fileBytes).fill(10)]), cover: new Blob([new Uint8Array(10).fill(20)]) }

test("network loss retries only the same upload chunk/finalization; binary bytes and CSRF are preserved", async t => {
  setApiSession({ username: "test", csrf: "test-csrf" })
  const bodies: ArrayBuffer[] = [], steps: string[] = [], calls: string[] = []
  let droppedChunk = false, droppedFinish = false
  t.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    calls.push(path)
    assert.equal(new Headers(options.headers).get("X-CSRF-Token"), "test-csrf")
    if (path === "/api/uploads") return Response.json({ id: "stage" })
    if (path.endsWith("/finish")) {
      if (!droppedFinish) { droppedFinish = true; throw new TypeError("Load failed") }
      return Response.json(draft)
    }
    if (options.method === "PUT") {
      assert.ok(options.body instanceof ArrayBuffer)
      assert.ok(options.body.byteLength <= chunkBytes)
      if (path.endsWith("/pdf/0")) {
        bodies.push(options.body.slice(0))
        if (!droppedChunk) { droppedChunk = true; throw new TypeError("Load failed") }
      }
      return Response.json({ ok: true })
    }
    throw Error("Unexpected request " + path)
  })
  assert.deepEqual(await insertDraft(draft, assets, undefined, step => steps.push(step)), draft)
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1])
  assert.equal(calls.filter(path => path.endsWith("/finish")).length, 2)
  assert.equal(calls.filter(path => path.endsWith("/pdf/1")).length, 1)
  assert.ok(steps.includes("저장 확인 · 연결 재시도 2/2"))
})
test("upload retry budget is shared across the file and preserves staging for later resume", async t => {
  let first = 0, second = 0, cleanup = 0
  t.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    if (path === "/api/uploads") return Response.json({ id: "stage" })
    if (options.method === "DELETE") { cleanup++; return Response.json({ ok: true }) }
    if (path.endsWith("/pdf/0") && first++ > 0) return Response.json({ ok: true })
    if (path.endsWith("/pdf/1")) second++
    throw new TypeError("Load failed")
  })
  await assert.rejects(insertDraft(draft, assets), /PDF 전송 2\/2: 서버 연결/)
  assert.equal(first, 2); assert.equal(second, 2); assert.equal(cleanup, 0)
})
test("validation and quota responses are never retried", async t => {
  let calls = 0
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ error: "무료 한도" }, { status: 429 }) })
  await assert.rejects(insertDraft(draft, assets), /업로드 시작: 무료 한도/)
  assert.equal(calls, 1)
})
test("canceling during a network retry stops transmission immediately", async t => {
  const controller = new AbortController()
  let sends = 0, cleanup = 0
  t.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    if (path === "/api/uploads") return Response.json({ id: "stage" })
    if (options.method === "DELETE") { cleanup++; return Response.json({ ok: true }) }
    sends++; throw new TypeError("Load failed")
  })
  await assert.rejects(insertDraft(draft, assets, controller.signal, step => { if (step.includes("재시도")) controller.abort() }), { name: "AbortError" })
  assert.equal(sends, 1); assert.equal(cleanup, 1)
})
test("explicit caller signals still retain a per-request timeout and are cleaned up", async t => {
  const external = new AbortController()
  t.mock.timers.enable({ apis: ["setTimeout"] })
  t.mock.method(globalThis, "fetch", async (_: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    assert.notEqual(options.signal, external.signal)
    options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true })
  }))
  const pending = api("/drafts", { signal: external.signal })
  const rejected = assert.rejects(pending, /서버 응답 시간/)
  t.mock.timers.tick(45_000)
  await rejected
  assert.equal(external.signal.aborted, false)
})
