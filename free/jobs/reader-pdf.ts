import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { readerPdfChunkBytes, readerPdfChunkedMaxBytes, readerPdfParts } from "../../lib/report-reader"

import { firstPageChunks } from "./reader-start"

const execute = promisify(execFile)
let pythonReady: Promise<string> | undefined
function python() {
  return pythonReady ??= (async () => {
    const check = resolve("scripts/check-pdf-runtime.py")
    if (process.env.SMP_PDF_PYTHON) {
      await execute(process.env.SMP_PDF_PYTHON, [check], {timeout:10000})
      return process.env.SMP_PDF_PYTHON
    }
    const binary = resolve(".smp-tools/pdf/bin/python")
    try { await execute(binary, [check], {timeout:10000}); return binary } catch {}
    if (process.env.SMP_ALLOW_PDF_TOOL_INSTALL !== "1") throw new Error("PDF optimizer is not installed")
    // Runs only for a changed PDF on the publisher, not every scheduled check.
    await execute("python3", ["-m","venv",".smp-tools/pdf"], {timeout:30000})
    await execute(binary, ["-m","pip","install","--only-binary=:all:","--disable-pip-version-check","-r","scripts/pdf-requirements.txt"], {timeout:120000,maxBuffer:1024*1024})
    await execute(binary, [check], {timeout:10000})
    return binary
  })()
}
export async function optimizeReaderPdf(id: string, bytes: Uint8Array) {
  if (!/^[a-f0-9]{32}$/.test(id) || bytes.length > 128 * 1024 * 1024) throw new Error("Invalid PDF optimization input")
  const binary = await python(), dir = await mkdtemp(join(tmpdir(), "smp-reader-"))
  try {
    const input=join(dir,"original.pdf"), output=join(dir,"reader.pdf")
    await writeFile(input,bytes)
    const {stdout}=await execute(binary,[resolve("scripts/optimize-report-pdf.py"),input,output],{timeout:45000,maxBuffer:65536})
    const result=JSON.parse(stdout)
    if (result.skipped) return undefined
    if (result.optimized !== true) throw new Error("PDF optimization failed")
    if ((await stat(output)).size > readerPdfChunkedMaxBytes) return undefined
    const data=await readFile(output), hash=createHash("sha256").update(data).digest("hex")
    const target=`.smp-cache/reader-pdfs/${id}`
    await mkdir(target,{recursive:true})
    const asset={url:`/_reader-pdfs/${id}/${hash}.pdf`,bytes:data.length,chunkSize:readerPdfChunkBytes,initialChunks:await firstPageChunks(data).catch(()=>[0])}
    for(const part of readerPdfParts(asset)) await writeFile(`.smp-cache/reader-pdfs/${part.url.slice('/_reader-pdfs/'.length)}`,data.subarray(part.start,part.start+part.bytes))
    return asset
  } finally { await rm(dir,{recursive:true,force:true}) }
}
