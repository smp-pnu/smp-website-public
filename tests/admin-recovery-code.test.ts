import assert from "node:assert/strict"
import { test } from "node:test"
import { normalizeAdminCode, parseRecoveryFile } from "../admin-lab/recovery-code"

test("recovery rejects passwords before issuing any authentication request", () => {
  for (const value of ["password10", "", "a".repeat(63), "a".repeat(65), "g".repeat(64), "a".repeat(32) + " " + "b".repeat(32)]) {
    assert.throws(() => normalizeAdminCode(value), /64자리/)
  }
  assert.equal(normalizeAdminCode("  " + "A1".repeat(32) + "\n"), "a1".repeat(32))
})

test("recovery import accepts the downloaded format from the former domain without interpreting other file text", () => {
  const code = "b2".repeat(32)
  assert.equal(parseRecoveryFile(`\uFEFFSMP PDF 관리자 시험판 복구 코드\r\nhttps://smp-pdf-admin-trial.smp-website.workers.dev\r\n\r\n${code}\r\n\r\n기기 분실 시 사용하세요.`), code)
  assert.equal(parseRecoveryFile(code.toUpperCase()), code)
  for (const text of ["password10", `code=${code}`, `${code}\n${code}`, "x".repeat(4097), "<script>throw 1</script>"]) assert.throws(() => parseRecoveryFile(text))
})
