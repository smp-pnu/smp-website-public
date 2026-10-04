import "server-only"
import { createHash } from "node:crypto"
import sharp from "sharp"
import { normalizeId, type ContentItem } from "./content-model"
import { getPdfSources } from "./pdf-source"
import type { CoverStore } from "./cover-store"

export type SavedCover = {
  version: 1; sourceKey: string; editedAt: string; hash: string; url: string
  width: number; height: number; bytes: number
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
  const url = new URL(cover.url)
  if (cover.version !== 1 || !/^[a-f0-9]{64}$/.test(cover.hash) || !/^[a-f0-9]{64}$/.test(cover.sourceKey)
    || url.protocol !== "https:" || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)
    || url.pathname !== `/${coverPrefix(id)}${cover.hash}.webp` || url.search || url.username || url.password || url.port
    || typeof cover.editedAt !== "string" || !(cover.width > 0 && cover.height > 0 && cover.bytes > 0)) {
    throw new Error("Invalid cover metadata")
  }
  return { cover, etag: value.etag }
}

export async function encodeCover(input: Uint8Array) {
  const { data, info } = await sharp(input, { limitInputPixels: 16_000_000 })
    .rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 82, effort: 5 })
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, hash: hash(data) }
}

// Reading an existing cover does no PDF/Drive work. Only publication changes,
// a missing image, and the daily reconciliation enter the generation branch.
export async function prepareCover(options: {
  item: ContentItem; store: CoverStore; force?: boolean
  fetchImage: () => Promise<Uint8Array>
  latestItem: () => Promise<ContentItem | null>
}) {
  const { item, store } = options
  const key = sourceKey(item)
  if (!key) return null
  const previous = await readCover(store, item.id)
  if (!options.force && currentCover(previous.cover, item)) return previous.cover
  const prefix = coverPrefix(item.id)
  // The public CDN can still serve an older current.json. Capture the actual
  // storage version before doing Drive/Notion work.
  const etag = store.version ? await store.version(`${prefix}current.json`) : previous.etag
  const image = await encodeCover(await options.fetchImage())
  const latest = await options.latestItem()
  if (!latest || sourceKey(latest) !== key || latest.editedAt !== item.editedAt) return null
  let url = previous.cover?.hash === image.hash ? previous.cover.url : undefined
  if (!url) {
    try { url = await store.write(`${prefix}${image.hash}.webp`, image.data, "image/webp", { immutable: true }) }
    catch (error) {
      // A concurrent request may already have completed the same revision.
      const concurrent = (await readCover(store, item.id)).cover
      if (currentCover(concurrent, item) && concurrent?.hash === image.hash) return concurrent
      throw error
    }
  }
  const cover: SavedCover = { version: 1, sourceKey: key, editedAt: item.editedAt ?? "", hash: image.hash, url,
    width: image.width, height: image.height, bytes: image.data.length }
  if (previous.etag !== etag || JSON.stringify(cover) !== JSON.stringify(previous.cover)) {
    try {
      await store.write(`${prefix}current.json`, new TextEncoder().encode(JSON.stringify(cover)), "application/json", { etag })
    } catch (error) {
      const concurrent = await readCover(store, item.id)
      if (currentCover(concurrent.cover, item) && (!store.version || await store.version(`${prefix}current.json`) === concurrent.etag)) return concurrent.cover
      throw error
    }
  }
  return cover
}
