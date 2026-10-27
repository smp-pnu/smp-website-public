type TextChunk = { items: ({ str: string; hasEOL?: boolean } | { type: string })[] }

// PDF.js getTextContent uses ReadableStream async iteration, which some Safari
// versions lack. The reader API works there without patching browser globals.
export async function readPdfText(stream: ReadableStream<TextChunk>, signal: AbortSignal, limit = 12_000) {
  signal.throwIfAborted()
  const reader = stream.getReader()
  let complete = false
  const reason = () => signal.reason instanceof Error ? signal.reason : Error("PDF text extraction stopped")
  const abort = () => { void reader.cancel(reason()).catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  let text = ""
  try {
    while (text.length < limit) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) { complete = true; break }
      for (const item of value.items) {
        if ("str" in item) text += (item.str + (item.hasEOL ? "\n" : " ")).slice(0, limit - text.length)
        if (text.length >= limit) break
      }
    }
    return text
  } finally {
    signal.removeEventListener("abort", abort)
    if (!complete) await reader.cancel(reason()).catch(() => {})
    reader.releaseLock()
  }
}
