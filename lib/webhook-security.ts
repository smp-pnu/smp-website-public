import "server-only"
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export function sameSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || expected.length < 32) return false
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function authorizedSync(request: Request) {
  const secret = process.env.CRON_SECRET
  return !!secret && secret.length >= 32 && sameSecret(request.headers.get("authorization"), `Bearer ${secret}`)
}
export function validNotionSignature(body: string, signature: string | null, token: string | undefined) {
  if (!token || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false
  return sameSecret(signature, `sha256=${createHmac("sha256", token).update(body).digest("hex")}`)
}

// Only for the one-time Notion handshake. The public store contains ciphertext,
// never the verification token; the encryption key remains server-only.
export function sealToken(token: string, secret: string) {
  if (secret.length < 32) throw new Error("Setup secret is not configured")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
}
export function openToken(encrypted: Uint8Array, secret: string) {
  if (secret.length < 32 || encrypted.length < 29) throw new Error("Invalid setup token")
  const value = Buffer.from(encrypted)
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), value.subarray(0, 12))
  decipher.setAuthTag(value.subarray(12, 28))
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8")
}
export async function limitedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 65_536) throw new Error("Request too large")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing body")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 65_536) { await reader.cancel(); throw new Error("Request too large") }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks).toString("utf8")
}
