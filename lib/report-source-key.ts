import { createHash } from "node:crypto"
import type { ContentItem } from "./content-model"
import { getPdfSources } from "./pdf-source"
const hash=(value:string)=>createHash("sha256").update(value).digest("hex")
export function sourceKey(item: ContentItem) {
  const pdf = getPdfSources(item)[0]
  if (!pdf) return null
  const url = new URL(pdf.url)
  // Notion renews signed URLs without changing the underlying file.
  if (url.hostname !== "drive.usercontent.google.com") url.search = ""
  return hash(url.href)
}
