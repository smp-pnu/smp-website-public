// A larger chunk avoids many small Drive/Notion requests for image-heavy reports.
export const pdfRangeChunkSize = 2 * 1024 * 1024

type PdfRange = { start: number; end: number | null } | { suffix: number }

export function parsePdfRange(value: string): PdfRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match) return null
  if (!match[1]) {
    const suffix = Number(match[2])
    return Number.isSafeInteger(suffix) && suffix > 0 ? { suffix } : null
  }
  const start = Number(match[1]), end = match[2] ? Number(match[2]) : null
  return Number.isSafeInteger(start) && (end === null || (Number.isSafeInteger(end) && start <= end)) ? { start, end } : null
}

export function resolvePdfRange(range: PdfRange, total: number) {
  return "suffix" in range ? { start: Math.max(0, total - range.suffix), end: total - 1 }
    : { start: range.start, end: Math.min(range.end ?? total - 1, total - 1) }
}

export function parsePdfContentRange(value: string | null) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? "")
  if (!match) return null
  const start = Number(match[1]), end = Number(match[2]), total = Number(match[3])
  return [start, end, total].every(Number.isSafeInteger) && start <= end && end < total ? { start, end, total } : null
}
