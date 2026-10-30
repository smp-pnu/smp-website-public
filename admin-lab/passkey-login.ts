import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser"

export type PasskeyLoginMethod = "device" | "phone"

export function passkeyLoginOptions(options: PublicKeyCredentialRequestOptionsJSON, method: PasskeyLoginMethod): PublicKeyCredentialRequestOptionsJSON {
  // The browser owns the FIDO QR exchange. Hints only choose its UI; the
  // existing server still verifies the challenge, origin, key and user presence.
  // Do not restrict transports or replace the server's credential allowlist.
  return method === "phone" ? { ...options, hints: ["hybrid"], timeout: 120_000 } : options
}
