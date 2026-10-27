// Shared deterministic content identity. Boundaries are fixed, independent of upload retries.
export const chunkBytes = 256 * 1024
export const coverLimit = 1024 * 1024
export const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("")
export const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => hex(await crypto.subtle.digest("SHA-256", bytes))
export async function manifestHash(parts: { bytes: number; hash: string }[]) {
  return sha256(new TextEncoder().encode("smp-pdf-chunks-v1\n" + parts.map(p => `${p.bytes}:${p.hash}`).join("\n")))
}
export async function fileIdentity(bytes: Uint8Array<ArrayBuffer>) {
  const parts: { bytes: number; hash: string }[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const part = bytes.slice(offset, offset + chunkBytes)
    parts.push({ bytes: part.length, hash: await sha256(part) })
  }
  return manifestHash(parts)
}
