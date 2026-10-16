import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { readerPdfMaxBytes } from "../../lib/report-reader"

const execute = promisify(execFile)
let pythonReady: Promise<string> | undefined
function python() {
  return pythonReady ??= (async () => {
    if (process.env.SMP_PDF_PYTHON) return process.env.SMP_PDF_PYTHON
    const binary = resolve(".smp-tools/pdf/bin/python")
    try { await execute(binary, ["-c", "import pikepdf; assert pikepdf.__version__ == '10.17.0'"], {timeout:10000}); return binary } catch {}
    if (process.env.SMP_ALLOW_PDF_TOOL_INSTALL !== "1") throw new Error("PDF optimizer is not installed")
    // Runs only for a changed PDF on the publisher, not every scheduled check.
    await execute("python3", ["-m","venv",".smp-tools/pdf"], {timeout:30000})
    await execute(binary, ["-m","pip","install","--only-binary=:all:","--disable-pip-version-check","-r","scripts/pdf-requirements.txt"], {timeout:120000,maxBuffer:1024*1024})
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
    if (result.linearized !== true) throw new Error("PDF optimization failed")
    if ((await stat(output)).size > readerPdfMaxBytes) return undefined
    const data=await readFile(output), hash=createHash("sha256").update(data).digest("hex")
    const target=`.smp-cache/reader-pdfs/${id}`
    await mkdir(target,{recursive:true}); await writeFile(`${target}/${hash}.pdf`,data)
    return {url:`/_reader-pdfs/${id}/${hash}.pdf`,bytes:data.length}
  } finally { await rm(dir,{recursive:true,force:true}) }
}
