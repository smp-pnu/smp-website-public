import path from "node:path"
import { reportExcerpt } from "../../lib/report-excerpt"
import type { Database } from "../../cloudflare/bindings"

export async function extractReportExcerpt(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const root = path.join(process.cwd(), "node_modules/pdfjs-dist")
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false,
    cMapUrl: `${root}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}/standard_fonts/`, wasmUrl: `${root}/wasm/` })
  const timeout = setTimeout(() => { void task.destroy().catch(() => {}) }, 15_000)
  try {
    const doc = await task.promise, pages: string[] = []
    for (let number = 1; number <= Math.min(doc.numPages, 2); number++) {
      const page = await doc.getPage(number), content = await page.getTextContent()
      pages.push(content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""))
      page.cleanup()
    }
    return reportExcerpt(pages)
  } finally { clearTimeout(timeout); await task.destroy() }
}

// Use spare slots in the existing publisher. At most 8 legacy PDFs/day;
// normal CMS edits get priority, and the existing 50/day preparation cap remains.
export async function queueReportExcerptBackfill(db: Database, now = Date.now()) {
  const key = `excerpt-backfill:${new Date(now).toISOString().slice(0, 10)}`
  const result = await db.prepare(`INSERT OR IGNORE INTO free_jobs(id,revision,next_at)
    SELECT id,revision,? FROM free_content WHERE kind='research' AND cover IS NOT NULL
      AND json_extract(cover,'$.excerpt.version') IS NULL
      AND NOT EXISTS(SELECT 1 FROM free_jobs)
      AND COALESCE((SELECT until_at FROM free_controls WHERE name=?),0)<8
    ORDER BY json_extract(item,'$.date') DESC,id DESC
    LIMIT (SELECT MIN(2,MAX(0,8-COALESCE((SELECT until_at FROM free_controls WHERE name=?),0)))) RETURNING id`).bind(now, key, key).all<{id:string}>()
  if (result.results.length) await db.prepare(`INSERT INTO free_controls(name,until_at) VALUES (?,?)
    ON CONFLICT(name) DO UPDATE SET until_at=until_at+excluded.until_at`).bind(key,result.results.length).run()
  return result.results.length
}
