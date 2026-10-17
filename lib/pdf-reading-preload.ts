export type ReadingDocument = {
  numPages: number
  getPage: (page: number) => Promise<{ getOperatorList: () => Promise<unknown> }>
  getData: () => Promise<Uint8Array>
}

// Warm the first three pages after the first paint, then fill PDF.js's existing
// byte cache. The returned whole-file buffer is not retained in React state.
export async function preloadPdfReading(pdf: ReadingDocument, options: {
  cancelled: () => boolean
  beforeFullDownload: () => Promise<boolean>
}) {
  for (let page = 1; page <= Math.min(3, pdf.numPages); page++) {
    if (options.cancelled()) return false
    await (await pdf.getPage(page)).getOperatorList()
  }
  if (options.cancelled() || !await options.beforeFullDownload() || options.cancelled()) return false
  await pdf.getData()
  return !options.cancelled()
}
