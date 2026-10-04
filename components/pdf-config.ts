"use client"

import { pdfjs } from "react-pdf"

// Keep both renderers aligned with the assets copied by prepare-pdf.mjs.
const assetPath = `/pdfjs/${pdfjs.version}`
pdfjs.GlobalWorkerOptions.workerSrc = `${assetPath}/pdf.worker.min.mjs`

export const pdfOptions = {
  cMapUrl: `${assetPath}/cmaps/`,
  standardFontDataUrl: `${assetPath}/standard_fonts/`,
  wasmUrl: `${assetPath}/wasm/`,
  isEvalSupported: false,
  disableRange: true,
}
