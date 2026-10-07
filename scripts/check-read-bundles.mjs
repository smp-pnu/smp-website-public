// Inspect actual production traces so a future UI import cannot silently pull
// PDF rendering/native image generation into ordinary page server functions.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const routes = ["page", "research/page", "research/[id]/page", "notice/page", "notice/[id]/page", "api/content/research/[id]/cover/route", "api/search/route"]
for (const route of routes) {
  const trace = JSON.parse(await readFile(`.next/server/app/${route}.js.nft.json`, "utf8"))
  const generationFiles = trace.files.filter(file => /node_modules\/(sharp|@napi-rs\/canvas|pdfjs-dist)|sharp-libvips/.test(file))
  assert.equal(generationFiles.length, 0, `${route} imports generation-only dependencies: ${generationFiles.slice(0, 3).join(", ")}`)
  console.log(`${route}: no PDF/image-generation dependencies`)
}
