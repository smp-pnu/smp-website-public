import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { cpSync, mkdirSync, readFileSync } from "node:fs"

// Resolve through react-pdf so the worker and renderer always use one version.
const require = createRequire(import.meta.url)
const pdfRequire = createRequire(require.resolve("react-pdf"))
const source = dirname(pdfRequire.resolve("pdfjs-dist/package.json"))
const { version } = JSON.parse(readFileSync(join(source, "package.json"), "utf8"))
const target = join(process.cwd(), "public", "pdfjs", version)
mkdirSync(target, { recursive: true })
cpSync(join(source, "build/pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"))
for (const folder of ["cmaps", "standard_fonts", "wasm"]) cpSync(join(source, folder), join(target, folder), { recursive: true })
cpSync(join(source, "LICENSE"), join(target, "LICENSE"))
