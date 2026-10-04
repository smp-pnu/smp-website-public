import "server-only"
import { type ContentItem } from "./content-model"
import { getPdfSources } from "./pdf-source"

export function driveCoverUrl(item: ContentItem) {
  const pdf = getPdfSources(item)[0]
  if (!pdf) return null
  const source = new URL(pdf.url)
  if (source.hostname !== "drive.usercontent.google.com") return null
  const url = new URL("https://drive.google.com/thumbnail")
  url.searchParams.set("id", source.searchParams.get("id")!)
  url.searchParams.set("sz", "w480")
  const resourceKey = source.searchParams.get("resourcekey")
  if (resourceKey) url.searchParams.set("resourcekey", resourceKey)
  return url.href
}

function allowedCoverUrl(value: string) {
  const url = new URL(value)
  return url.protocol === "https:" && !url.port && !url.username && !url.password
    && ((url.hostname === "drive.google.com" && url.pathname === "/thumbnail") || /^lh[3-6]\.googleusercontent\.com$/.test(url.hostname))
}

export async function fetchReportCover(url: string, signal: AbortSignal) {
  let response: Response | undefined
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!allowedCoverUrl(url)) throw new Error("Unsupported cover URL")
    response = await fetch(url, { cache: "no-store", redirect: "manual", signal })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    await response.body?.cancel()
    const location = response.headers.get("location")
    if (!location || redirects === 3) throw new Error("Unsupported cover redirect")
    url = new URL(location, url).href
  }
  if (!response?.ok || !response.body) { await response?.body?.cancel(); throw new Error("Cover unavailable") }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > 2 * 1024 * 1024) throw new Error("Cover too large")
      chunks.push(value)
    }
  } catch (error) { await reader.cancel(); throw error } finally { reader.releaseLock() }
  const bytes = Buffer.concat(chunks)
  const type = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null
  if (!type) throw new Error("Source is not a supported cover image")
  return { bytes, type }
}
