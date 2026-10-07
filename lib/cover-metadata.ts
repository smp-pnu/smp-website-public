import "server-only"
import { createHash } from "node:crypto"
import { normalizeId, type ContentItem } from "./content-model"
import { getPdfSources } from "./pdf-source"
import type { CoverStore } from "./cover-store"

type CoverImage = { hash: string; url: string; width: number; height: number; bytes: number }
export type SavedCover = CoverImage & {
  version: 1; sourceKey: string; editedAt: string
  preview?: CoverImage
}
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")

export function coverPrefix(id: string) {
  if (normalizeId(id) !== id) throw new Error("Invalid report ID")
  return `report-covers/${id}/`
}
export function sourceKey(item: ContentItem) {
  const pdf = getPdfSources(item)[0]
  if (!pdf) return null
  const url = new URL(pdf.url)
  // Notion renews signed URLs without changing the underlying file.
  if (url.hostname !== "drive.usercontent.google.com") url.search = ""
  return hash(url.href)
}
export function currentCover(cover: SavedCover | null, item: ContentItem) {
  return !!cover && cover.sourceKey === sourceKey(item) && cover.editedAt === (item.editedAt ?? "")
}
export async function readCover(store: CoverStore, id: string) {
  const value = await store.read(`${coverPrefix(id)}current.json`)
  if (!value) return { cover: null, etag: undefined }
  const cover = JSON.parse(new TextDecoder().decode(value.bytes)) as SavedCover
  if (!validImage(cover, id) || (cover.preview && !validImage(cover.preview, id))) throw new Error("Invalid cover metadata")
  if (cover.version !== 1 || !/^[a-f0-9]{64}$/.test(cover.sourceKey) || typeof cover.editedAt !== "string") throw new Error("Invalid cover metadata")
  return { cover, etag: value.etag }
}

function validImage(image: CoverImage, id: string) {
  const url = new URL(image.url)
  return /^[a-f0-9]{64}$/.test(image.hash)
    && url.protocol === "https:" && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)
    && url.pathname === `/${coverPrefix(id)}${image.hash}.webp` && !url.search && !url.username && !url.password && !url.port
    && [image.width, image.height, image.bytes].every(value => Number.isSafeInteger(value) && value > 0)
}
