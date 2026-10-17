export type PdfPageBuffer = {
  requested: number
  visible: number | null
  entries: { page: number; ready: boolean; failed?: boolean }[]
}

export function createPdfPageBuffer(page: number): PdfPageBuffer {
  return { requested: page, visible: null, entries: [{ page, ready: false }] }
}

export function updatePdfPageBuffer(state: PdfPageBuffer, event: { type: 'request' | 'ready' | 'failed'; page: number }, total: number, warm = true): PdfPageBuffer {
  if (event.page < 1 || event.page > total) return state
  let { requested, visible } = state
  let entries = state.entries.map(entry => ({ ...entry }))
  if (event.type === 'request') {
    requested = event.page
    entries = entries.filter(entry => entry.page !== requested || !entry.failed)
    if (!entries.some(entry => entry.page === requested)) entries.push({ page: requested, ready: false })
  } else {
    const entry = entries.find(entry => entry.page === event.page)
    // A cancelled render must never replace the latest requested page.
    if (!entry) return state
    entry.ready = event.type === 'ready'
    entry.failed = event.type === 'failed'
  }
  if (entries.find(entry => entry.page === requested)?.ready) visible = requested

  if (warm && visible === requested) {
    const candidates = requested <= 2 ? [1, 2, 3] : [requested + 1]
    const next = candidates.find(page => page <= total && !entries.some(entry => entry.page === page))
    // Only one speculative canvas at a time; retain at most three canvases.
    if (next && !entries.some(entry => !entry.ready && !entry.failed)) entries.push({ page: next, ready: false })
  }
  while (entries.length > (warm ? 3 : 2)) {
    const index = entries.findIndex(entry => entry.page !== visible && entry.page !== requested)
    entries.splice(index, 1)
  }
  return { requested, visible, entries }
}
