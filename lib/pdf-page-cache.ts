export type PreparedPdfPage = { page: number; url: string; bytes: number; ratio: number }
export type PdfPreparation = { entries: PreparedPdfPage[]; complete: boolean; limited: boolean; failed: number[] }

// Keep compressed images, not one large canvas (and text layer) per PDF page.
// The renderer owns one scratch canvas; the viewer decodes only three images.
export class PdfPageCache {
  private entries = new Map<number, PreparedPdfPage>()
  private failures = new Set<number>()
  private bytes = 0
  private requested = 1
  private visible = 0
  private full = false
  private paused = false
  private limited = false
  private busy = false
  private stopped = false
  private abort = new AbortController()

  constructor(private options: {
    total: number; maxBytes: number; maxPages?: number
    render: (page: number, signal: AbortSignal) => Promise<PreparedPdfPage>
    release: (page: PreparedPdfPage) => void
    changed: (state: PdfPreparation) => void
    yield: () => Promise<void>
  }) {}

  request(page: number) {
    if (page < 1 || page > this.options.total || this.stopped) return
    this.requested = page
    void this.pump()
  }
  show(page: number) { this.visible = page }
  prepareRest() { this.full = true; void this.pump() }
  pause(value: boolean) { this.paused = value; if (!value) void this.pump() }
  dispose() {
    this.stopped = true
    this.abort.abort()
    for (const entry of this.entries.values()) this.options.release(entry)
    this.entries.clear()
    this.bytes = 0
  }
  snapshot(): PdfPreparation {
    return { entries: [...this.entries.values()], complete: this.entries.size === this.options.total,
      limited: this.limited, failed: [...this.failures] }
  }
  private next() {
    const missing = (page: number) => !this.entries.has(page) && !this.failures.has(page)
    if (missing(this.requested)) return this.requested
    if (this.limited) return undefined
    const count = this.full ? this.options.total : Math.min(3, this.options.total)
    for (let page = 1; page <= count; page++) if (missing(page)) return page
  }
  private async pump() {
    if (this.busy || this.stopped || this.paused) return
    this.busy = true
    try {
      while (!this.stopped && !this.paused) {
        const page = this.next()
        if (page === undefined) break
        try {
          const entry = await this.options.render(page, this.abort.signal)
          if (this.stopped) { this.options.release(entry); break }
          const overLimit = () => this.bytes + entry.bytes > this.options.maxBytes || this.entries.size >= (this.options.maxPages ?? 120)
          if (overLimit()) {
            this.limited = true
            // A requested page must still work when speculative preparation hits a limit.
            if (page !== this.requested) { this.options.release(entry); this.options.changed(this.snapshot()); continue }
            for (const [key, old] of this.entries) {
              if (!overLimit()) break
              if (key === this.visible) continue
              this.options.release(old); this.entries.delete(key); this.bytes -= old.bytes
            }
          }
          this.entries.set(page, entry)
          this.bytes += entry.bytes
        } catch {
          if (this.stopped) break
          this.failures.add(page)
        }
        this.options.changed(this.snapshot())
        await this.options.yield()
      }
    } finally { this.busy = false }
  }
}
