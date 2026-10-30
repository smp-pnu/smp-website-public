export type PreparedPdfPage = { page: number; url: string; bytes: number; ratio: number; width?: number }
export type PdfPreparation = { entries: PreparedPdfPage[]; complete: boolean; limited: boolean; failed: number[] }

// Keep compressed images, not one large canvas (and text layer) per PDF page.
// The renderer owns one scratch canvas; only the visible/next spread is decoded.
export class PdfPageCache {
  private entries = new Map<number, PreparedPdfPage>()
  private failures = new Set<number>()
  private bytes = 0
  private requested = 1
  private requestedCount = 1
  private visible = 0
  private visibleCount = 1
  private full = false
  private paused = false
  private limited = false
  private busy = false
  private stopped = false
  private abort = new AbortController()
  private active?: {page:number; abort:AbortController}

  constructor(private options: {
    total: number; maxBytes: number; maxPages?: number
    render: (page: number, signal: AbortSignal) => Promise<PreparedPdfPage>
    release: (page: PreparedPdfPage) => void
    changed: (state: PdfPreparation) => void
    yield: () => Promise<void>
  }) {}

  request(page: number, count: 1 | 2 = 1) {
    if (page < 1 || page > this.options.total || this.stopped) return
    this.requested = page
    this.requestedCount = count
    // Do not make a reader wait for an expensive speculative page render.
    if(this.active && !this.isRequested(this.active.page) && Array.from({length:count},(_,i)=>page+i).some(p=>p<=this.options.total && !this.entries.has(p))) this.active.abort.abort()
    void this.pump()
  }
  show(page: number, count: 1 | 2 = 1) { this.visible = page; this.visibleCount = count }
  private isRequested(page:number) { return page>=this.requested && page<this.requested+this.requestedCount }
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
    for(let page=this.requested;page<Math.min(this.requested+this.requestedCount,this.options.total+1);page++)if(missing(page))return page
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
        const active={page,abort:new AbortController()}
        this.active=active
        try {
          const entry = await this.options.render(page, AbortSignal.any([this.abort.signal,active.abort.signal]))
          if (this.stopped) { this.options.release(entry); break }
          const overLimit = () => this.bytes + entry.bytes > this.options.maxBytes || this.entries.size >= (this.options.maxPages ?? 120)
          if (overLimit()) {
            this.limited = true
            // A requested page must still work when speculative preparation hits a limit.
            if (!this.isRequested(page)) { this.options.release(entry); this.options.changed(this.snapshot()); continue }
            for (const [key, old] of this.entries) {
              if (!overLimit()) break
              if (this.isRequested(key) || (key>=this.visible && key<this.visible+this.visibleCount)) continue
              this.options.release(old); this.entries.delete(key); this.bytes -= old.bytes
            }
          }
          this.entries.set(page, entry)
          this.bytes += entry.bytes
        } catch {
          if (this.stopped) break
          if(!active.abort.signal.aborted)this.failures.add(page)
        } finally {if(this.active===active)this.active=undefined}
        this.options.changed(this.snapshot())
        await this.options.yield()
      }
    } finally { this.busy = false }
  }
}
