import "server-only"
import { createHash } from "node:crypto"
import sharp from "sharp"
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

export async function encodeCover(input: Uint8Array, reader = false) {
  const { data, info } = await sharp(input, { limitInputPixels: 16_000_000 })
    .rotate().resize({ width: reader ? 2048 : 720, withoutEnlargement: true }).webp({ quality: reader ? 94 : 82, effort: 5 })
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, hash: hash(data) }
}

// Reading an existing cover does no PDF/Drive work. Only publication changes,
// a missing image, and the daily reconciliation enter the generation branch.
export async function prepareCover(options: {
  item: ContentItem; store: CoverStore; force?: boolean
  fetchImage: () => Promise<Uint8Array>
  fetchPreview?: () => Promise<Uint8Array>
  latestItem: () => Promise<ContentItem | null>
}) {
  const { item, store } = options
  const key = sourceKey(item)
  if (!key) return null
  const previous = await readCover(store, item.id)
  if (!options.force && currentCover(previous.cover, item) && (!options.fetchPreview || previous.cover?.preview)) return previous.cover
  const prefix = coverPrefix(item.id)
  // The public CDN can still serve an older current.json. Capture the actual
  // storage version before doing Drive/Notion work.
  const etag = store.version ? await store.version(`${prefix}current.json`) : previous.etag
  const image = await encodeCover(await options.fetchImage())
  // Keep the reader image when only metadata changed. A changed PDF/cover
  // invalidates it; ordinary card refreshes never retain a stale reader image.
  let preview = previous.cover?.sourceKey === key && previous.cover.hash === image.hash ? previous.cover.preview : undefined
  const readerImage = options.fetchPreview && !preview ? await encodeCover(await options.fetchPreview(), true) : undefined
  const latest = await options.latestItem()
  if (!latest || sourceKey(latest) !== key || latest.editedAt !== item.editedAt) return null
  let url = previous.cover?.hash === image.hash ? previous.cover.url : undefined
  if (!url) {
    try { url = await store.write(`${prefix}${image.hash}.webp`, image.data, "image/webp", { immutable: true }) }
    catch (error) {
      // A concurrent request may already have completed the same revision.
      const concurrent = (await readCover(store, item.id)).cover
      if (currentCover(concurrent, item) && concurrent?.hash === image.hash && (!options.fetchPreview || concurrent.preview)) return concurrent
      throw error
    }
  }
  if (readerImage) {
    const readerUrl = await store.write(`${prefix}${readerImage.hash}.webp`, readerImage.data, "image/webp", { immutable: true })
    preview = { url: readerUrl, hash: readerImage.hash, width: readerImage.width, height: readerImage.height, bytes: readerImage.data.length }
  }
  const cover: SavedCover = { version: 1, sourceKey: key, editedAt: item.editedAt ?? "", hash: image.hash, url,
    width: image.width, height: image.height, bytes: image.data.length, ...(preview ? { preview } : {}) }
  if (previous.etag !== etag || JSON.stringify(cover) !== JSON.stringify(previous.cover)) {
    try {
      await store.write(`${prefix}current.json`, new TextEncoder().encode(JSON.stringify(cover)), "application/json", { etag })
    } catch (error) {
      const concurrent = await readCover(store, item.id)
      if (currentCover(concurrent.cover, item) && (!options.fetchPreview || concurrent.cover?.preview)
        && (!store.version || await store.version(`${prefix}current.json`) === concurrent.etag)) return concurrent.cover
      throw error
    }
  }
  return cover
}
