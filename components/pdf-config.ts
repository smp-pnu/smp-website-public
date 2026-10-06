"use client"

import { pdfjs } from "react-pdf"
import { pdfRangeChunkSize } from "@/lib/pdf-range"

// Keep both renderers aligned with the assets copied by prepare-pdf.mjs.
const assetPath = `/pdfjs/${pdfjs.version}`
pdfjs.GlobalWorkerOptions.workerSrc = `${assetPath}/pdf.worker.min.mjs`

export const pdfOptions = {
  cMapUrl: `${assetPath}/cmaps/`,
  standardFontDataUrl: `${assetPath}/standard_fonts/`,
  wasmUrl: `${assetPath}/wasm/`,
  isEvalSupported: false,
  disableRange: false,
  // Keep the main transfer flowing: older PDFs scatter their page tree across
  // the file. Range-only loading adds serial Drive round trips for those files.
  // PDF.js can prioritize missing ranges while the continuous download proceeds.
  disableStream: false,
  disableAutoFetch: true,
  rangeChunkSize: pdfRangeChunkSize,
}
