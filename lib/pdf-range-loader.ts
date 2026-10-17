import { parsePdfContentRange } from './pdf-range'
import { readerPdfChunkBytes as size, type ReaderTransport } from './report-reader'

// Initial reads stay at 1 MiB. Later contiguous reads share up to four chunks
// per HTTP request, so filling the PDF.js cache does not cost one API call per
// chunk. Every request remains pinned to the same prepared PDF and authorized.
export function createPdfRangeLoader(url: string, hint: ReaderTransport, onFailure: () => void, fetcher: typeof fetch = fetch) {
  const controller = new AbortController()
  const pending = new Map<number, Promise<Uint8Array>>()
  const queue: { run: () => void; reject: (reason: unknown) => void }[] = []
  let active = 0, failed = false
  const pump = () => { while (active < 4 && queue.length && !controller.signal.aborted) queue.shift()!.run() }

  function reserve(indexes: number[]) {
    const values = indexes.map(index => {
      const value = Promise.withResolvers<Uint8Array>()
      pending.set(index, value.promise)
      void value.promise.catch(() => {
        if (!failed && !controller.signal.aborted) { failed = true; onFailure() }
      })
      return value
    })
    const reject = (reason: unknown) => values.forEach(value => value.reject(reason))
    const run = () => {
      active++
      const start = indexes[0] * size, end = Math.min(hint.bytes, (indexes.at(-1)! + 1) * size) - 1
      const target = `${url}${url.includes('?') ? '&' : '?'}prepared=${hint.key}`
      void (async () => {
        const response = await fetcher(target, {
          headers: { Range: `bytes=${start}-${end}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        })
        const range = parsePdfContentRange(response.headers.get('content-range'))
        if (response.status !== 206 || response.headers.get('content-type') !== 'application/pdf'
          || !range || range.start !== start || range.end !== end || range.total !== hint.bytes) {
          await response.body?.cancel()
          throw Error('Prepared PDF changed or unavailable')
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.length !== end - start + 1) throw Error('Incomplete PDF range')
        for (let i = 0; i < indexes.length; i++) {
          // Separate ownership: PDF.js transfers consumed buffers to its worker.
          values[i].resolve(indexes.length === 1 ? bytes : bytes.slice(i * size, Math.min(bytes.length, (i + 1) * size)))
        }
      })().catch(reject).finally(() => { active--; pump() })
    }
    if (controller.signal.aborted) reject(controller.signal.reason)
    else { queue.push({ run, reject }); pump() }
  }

  function reserveMissing(indexes: number[], groupSize: number) {
    let group: number[] = []
    const flush = () => { if (group.length) reserve(group); group = [] }
    for (const index of indexes) {
      if (pending.has(index)) { flush(); continue }
      if (group.length && (group.length === groupSize || group.at(-1)! + 1 !== index)) flush()
      group.push(index)
    }
    flush()
  }

  return {
    prefetch() { reserveMissing([hint.chunks[0], hint.chunks.at(-1)!, ...hint.chunks.slice(1, -1)], 1) },
    async read(begin: number, end: number) {
      if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > hint.bytes) throw Error('Invalid PDF range')
      const indexes = Array.from({ length: Math.ceil(end / size) - Math.floor(begin / size) }, (_, i) => Math.floor(begin / size) + i)
      reserveMissing(indexes, 4)
      const values = await Promise.all(indexes.map(index => pending.get(index)!))
      if (values.length === 1 && begin % size === 0 && end - begin === values[0].length) { pending.delete(indexes[0]); return values[0] }
      const result = new Uint8Array(end - begin)
      let offset = 0
      for (let i = 0; i < values.length; i++) {
        const from = Math.max(0, begin - indexes[i] * size), to = Math.min(values[i].length, end - indexes[i] * size)
        result.set(values[i].subarray(from, to), offset)
        offset += to - from
        pending.delete(indexes[i])
      }
      return result
    },
    abort() { controller.abort(); for (const entry of queue.splice(0)) entry.reject(controller.signal.reason); pending.clear() },
  }
}
