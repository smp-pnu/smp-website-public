import assert from "node:assert/strict"
import { test } from "node:test"
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser"
import { passkeyLoginOptions } from "../admin-lab/passkey-login"

test("phone login reaches WebAuthn as a hybrid hint without changing the security challenge or allowlist", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  const originalCredential = Object.getOwnPropertyDescriptor(globalThis, "PublicKeyCredential")
  const options: PublicKeyCredentialRequestOptionsJSON = {
    challenge: "dGVzdC1jaGFsbGVuZ2U", rpId: "admin.pnusmp.com", userVerification: "required", timeout: 60000,
    allowCredentials: [{ id: "YWxsb3dlZC1rZXk", type: "public-key", transports: ["internal", "hybrid"] }],
  }
  const snapshot = structuredClone(options)
  let seen: CredentialRequestOptions | undefined
  Object.defineProperty(globalThis, "PublicKeyCredential", { configurable: true, value: class {} })
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { credentials: { get: async (value: CredentialRequestOptions) => {
    seen = value
    throw new DOMException("Cancelled by user", "NotAllowedError")
  } } } })
  try {
    for (const method of ["phone", "device"] as const) {
      await assert.rejects(startAuthentication({ optionsJSON: passkeyLoginOptions(options, method) }), { name: "NotAllowedError" })
      assert.equal(seen?.publicKey?.rpId, options.rpId)
      assert.equal(seen?.publicKey?.userVerification, "required")
      assert.deepEqual(Buffer.from(seen!.publicKey!.challenge as ArrayBuffer), Buffer.from(options.challenge, "base64url"))
      assert.deepEqual(seen?.publicKey?.allowCredentials?.[0].transports, ["internal", "hybrid"])
      assert.equal(seen?.publicKey?.timeout, method === "phone" ? 120000 : 60000)
      assert.deepEqual((seen?.publicKey as { hints?: string[] }).hints, method === "phone" ? ["hybrid"] : undefined)
    }
    assert.deepEqual(options, snapshot)
  } finally {
    for (const [name, descriptor] of [["navigator", originalNavigator], ["PublicKeyCredential", originalCredential]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
