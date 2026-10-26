// Local evaluation helper: extract only bounded/redacted source pages and the
// exact production prompt. This script does not contact a service or publish.
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readPdfText } from '../admin-lab/pdf-text.ts'
import { aiPages } from '../admin-lab/ai-fields.ts'
import { metadataModel, metadataPrompt, metadataPromptLimit } from '../admin-cloud/ai-metadata.ts'
const require = createRequire(import.meta.url), root = path.dirname(require.resolve('pdfjs-dist/package.json'))
const task = getDocument({data:new Uint8Array(await readFile(process.argv[2])),cMapUrl:root+'/cmaps/',cMapPacked:true,standardFontDataUrl:root+'/standard_fonts/',wasmUrl:root+'/wasm/',enableXfa:false})
try {
  const pdf=await task.promise, texts=[]
  for(let i=1;i<=Math.min(3,pdf.numPages);i++) texts.push(await readPdfText((await pdf.getPage(i)).streamTextContent(),new AbortController().signal))
  const pages=aiPages(texts), prompt=metadataPrompt(pages)
  if(new TextEncoder().encode(JSON.stringify(prompt)).length>metadataPromptLimit) throw Error('Prompt limit exceeded')
  await writeFile(process.argv[3],JSON.stringify({model:metadataModel,pages,prompt},null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({pages:pdf.numPages,sourceBytes:new TextEncoder().encode(pages.join('')).length,promptBytes:new TextEncoder().encode(JSON.stringify(prompt)).length}))
} finally { await task.destroy() }
