import "server-only"
import { get, put, list, del, head, BlobNotFoundError } from "@vercel/blob"

export type StoredValue = { bytes: Uint8Array; etag: string }
export interface CoverStore {
  read(path: string): Promise<StoredValue | null>
  // Control-plane metadata bypasses the public delivery cache when a writer
  // needs the current version. Ordinary cover/list reads do not call this.
  version?(path: string): Promise<string | undefined>
  write(path: string, bytes: Uint8Array, type: string, options?: { etag?: string; immutable?: boolean }): Promise<string>
  remove(paths: string[]): Promise<void>
  paths(prefix: string, olderThan?: Date): Promise<string[]>
}

export function coverStorageEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN || !!(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
}

export const coverStore: CoverStore = {
  async version(path) {
    try { return (await head(path, { abortSignal: AbortSignal.timeout(8_000) })).etag }
    catch (error) { if (error instanceof BlobNotFoundError) return undefined; throw error }
  },
  async read(path) {
    const result = await get(path, { access: "public", useCache: true, abortSignal: AbortSignal.timeout(8_000) })
    if (!result || result.statusCode !== 200) return null
    if (result.blob.size > 16_384) { await result.stream.cancel(); throw new Error("Invalid cover metadata") }
    return { bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()), etag: result.blob.etag }
  },
  async write(path, bytes, type, options = {}) {
    const result = await put(path, Buffer.from(bytes), {
      access: "public", addRandomSuffix: false,
      allowOverwrite: !!options.etag || !!options.immutable,
      ...(options.etag ? { ifMatch: options.etag } : {}),
      contentType: type,
      cacheControlMaxAge: options.immutable ? 31_536_000 : 60,
      abortSignal: AbortSignal.timeout(15_000),
    })
    return result.url
  },
  async remove(paths) { if (paths.length) await del(paths, { abortSignal: AbortSignal.timeout(15_000) }) },
  async paths(prefix, olderThan) {
    const paths: string[] = []
    let cursor: string | undefined
    do {
      const result = await list({ prefix, cursor, limit: 1000, abortSignal: AbortSignal.timeout(15_000) })
      paths.push(...result.blobs.filter(blob => !olderThan || blob.uploadedAt < olderThan).map(blob => blob.pathname))
      cursor = result.hasMore ? result.cursor : undefined
    } while (cursor)
    return paths
  },
}
