import "server-only"
import { createHash } from "node:crypto"
import sharp from "sharp"
import type { ContentItem } from "./content-model"
import type { CoverStore } from "./cover-store"
import { coverPrefix, currentCover, readCover, sourceKey, type SavedCover } from "./cover-metadata"

const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")

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
