// PDF.js + native canvas, no browser automation or live service connections.
// Optional arguments: input PDF, output JPEG (for the isolated workerd test).
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'
import { readPdfText } from '../admin-lab/pdf-text.ts'
import { encodePdfCover } from '../admin-lab/pdf-cover.ts'
import { validateCover } from '../admin-cloud/files.ts'
import { samplePdf } from '../admin-lab/sample.ts'
import { extractFields } from '../admin-lab/extract.ts'
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D })
// The Node-compatible build has the same getTextContent async-iteration path.
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
const require = createRequire(import.meta.url)
const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
const source = process.argv[2] ? new Uint8Array(await readFile(process.argv[2])) : new Uint8Array(await samplePdf(0).arrayBuffer())
const sourceHash = createHash('sha256').update(source).digest('hex')
const task = getDocument({ data: source, cMapUrl: root+'/cmaps/', cMapPacked:true, standardFontDataUrl:root+'/standard_fonts/', wasmUrl:root+'/wasm/', enableXfa:false })
const signal = new AbortController().signal
const descriptor = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator)
const started = performance.now()
try {
  const pdf = await task.promise, expected = [], texts = []
  for (let number=1; number<=Math.min(pdf.numPages,3); number++) {
    const page = await pdf.getPage(number), text = await page.getTextContent()
    expected.push(text.items.map(item=>'str' in item ? item.str+(item.hasEOL?'\n':' ') : '').join('').slice(0,12000))
  }
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value:undefined, configurable:true })
  const first = await pdf.getPage(1)
  const originalStream = first.streamTextContent
  let failedStream
  first.streamTextContent = function (...args) { failedStream = originalStream.apply(this,args); return failedStream }
  await assert.rejects(first.getTextContent(), { name:'TypeError' })
  first.streamTextContent = originalStream
  await failedStream.cancel(Error('Expected compatibility regression'))
  for(let number=1;number<=Math.min(pdf.numPages,3);number++) {
    const page = await pdf.getPage(number)
    texts.push(await readPdfText(page.streamTextContent(),signal)); page.cleanup()
  }
  assert.deepEqual(texts,expected)
  assert.ok(texts.some(text=>text.length>0))
  const natural = first.getViewport({scale:1}), scale = Math.min(1200/natural.width,Math.sqrt(2_000_000/(natural.width*natural.height)))
  const viewport = first.getViewport({scale}), canvas = createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height))
  await first.render({ canvas, canvasContext:canvas.getContext('2d'),viewport,background:'white' }).promise
  const requested = []
  const cover = await encodePdfCover({ toBlob(callback,type,quality) {
    requested.push(type)
    const actual = type==='image/webp'?'image/png':type
    callback(new Blob([canvas.toBuffer(actual,Math.round(quality*100))],{type:actual}))
  } },signal)
  assert.deepEqual(requested,['image/webp','image/jpeg'])
  const image = new Uint8Array(await cover.arrayBuffer())
  assert.equal(validateCover(image,image.length),'image/jpeg')
  if(process.argv[3]) await writeFile(process.argv[3],image)
  const fields = extractFields(path.basename(process.argv[2]??'sample.pdf'),texts).fields
  console.log(JSON.stringify({result:'pass',sourceHash,pages:pdf.numPages,extractedCharacters:texts.map(t=>t.length),oldImplementationFailsWithoutAsyncIterator:true,newTextMatchesOriginal:true,company:fields.company,ticker:fields.ticker,coverType:cover.type,coverBytes:cover.size,elapsedMs:Math.round(performance.now()-started)}))
} finally {
  if(descriptor) Object.defineProperty(ReadableStream.prototype,Symbol.asyncIterator,descriptor)
  await task.destroy()
}
