import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import type { Database, Statement } from '../cloudflare/bindings'
import type { Env } from '../free/server/types'
import type { NotionPage, ContentItem } from '../lib/content-model'
import type { PublicCover } from '../lib/public-cover'
import { internal } from '../free/server/jobs'
import { storePage } from '../free/server/catalog'
import { prepareBody, prepareCover, saveImage } from '../free/jobs/prepare'
import { prepareReaderPack } from '../free/jobs/reader-pack'
import { renderReaderPages } from '../lib/pdf-preview-render'
import { createPagePackLoader } from '../lib/pdf-page-pack-loader'
import worker from '../free/server/worker'

// Four visibly different vector pages exercise the boundary beyond the three
// previews without checking in a real member's report or calling cloud APIs.
function reportPdf(replacement = false) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R] /Count 4 >>']
  for (let page = 0; page < 4; page++) {
    const paint = `${replacement ? 1 : 0} ${page / 4} 0 rg 0 0 595 842 re f`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents ${4 + page * 2} 0 R >>`,
      `<< /Length ${paint.length} >>\nstream\n${paint}\nendstream`)
  }
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

test('a new Notion report reaches the whole-page reader; replacement and withdrawal reject the old edition', async () => {
  Object.assign(globalThis, { __SMP_FIXTURE__: false })
  const id = randomUUID().replaceAll('-', ''), source = '33333333333343338333333333333333'
  const sqlite = new DatabaseSync(':memory:')
  for (const migration of ['0002_free_runtime', '0003_free_guards', '0004_document_versions', '0006_report_cover_cache', '0008_publication_checks', '0009_job_failures']) {
    sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${migration}.sql`, import.meta.url), 'utf8'))
  }
  const prepare = (sql: string, values: unknown[] = []): Statement => ({
    bind: (...args) => prepare(sql, args),
    async first<T>() { return (sqlite.prepare(sql).get(...values as any[]) ?? null) as T | null },
    async all<T>() { return { results: sqlite.prepare(sql).all(...values as any[]) as T[] } },
    async run() { return sqlite.prepare(sql).run(...values as any[]) },
  })
  const db: Database = { prepare, async batch(statements) {
    sqlite.exec('BEGIN')
    try { const values = []; for (const statement of statements) values.push(await statement.run()); sqlite.exec('COMMIT'); return values }
    catch (error) { sqlite.exec('ROLLBACK'); throw error }
  } }
  let page: NotionPage = { id, object: 'page', created_time: '2026-01-01T00:00:00.000Z', last_edited_time: '2026-01-01T00:00:00.000Z',
    parent: { type: 'data_source_id', data_source_id: source }, properties: {
      제목: { type: 'title', title: [{ plain_text: 'New report fixture' }] }, 공개: { type: 'checkbox', checkbox: true },
      게시일: { type: 'date', date: { start: '2026-01-01' } },
      '외부 링크': { type: 'url', url: 'https://drive.google.com/file/d/fixture-new-report/view' },
    } }
  let dispatches = 0, downloads = 0, renders = 0, assetReads = 0, pdf = reportPdf()
  const pending: Promise<unknown>[] = [], ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) }
  const env: Env = { CMS_DB: db, NOTION_TOKEN: 'fixture-token', NOTION_REPORTS_DATA_SOURCE_ID: source,
    NOTION_NOTICES_DATA_SOURCE_ID: '22222222222242228222222222222222', NOTION_MEMBERS_DATA_SOURCE_ID: '44444444444444448444444444444444',
    NOTION_WEBHOOK_VERIFICATION_TOKEN: 'fixture-signature', GITHUB_PUBLISH_TOKEN: 'fixture-publisher',
    NOTION_FETCH: async url => Response.json(String(url).includes('/children') ? { results: [], has_more: false, next_cursor: null } : page),
    PUBLISH_FETCH: async (_url, init) => { dispatches++; assert.deepEqual(JSON.parse(String(init?.body)), { ref: 'main' }); return new Response(null, { status: 204 }) },
    ASSETS: { fetch: async request => {
      const path = new URL(request instanceof Request ? request.url : String(request)).pathname
      assert.match(path, new RegExp(`^/_reader-pdfs/${id}/[a-f0-9]{64}\\.pack$`))
      const bytes = await readFile(`.smp-cache/reader-pdfs/${path.slice('/_reader-pdfs/'.length)}`)
      assetReads++
      return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) } })
    } },
  }
  const call = (path: string) => worker.fetch(new Request(`https://fixture.invalid${path}`), env, ctx)
  const jobRequest = (suffix: string, body?: unknown) => new Request(`https://fixture.invalid/api/internal/jobs/${suffix}`, {
    method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const dependencies = {
    download: async () => { downloads++; return { data: pdf, lastModified: 'Tue, 06 Oct 2026 04:50:46 GMT' } },
    render: async (bytes: Uint8Array) => { renders++; return renderReaderPages(bytes) },
    save: saveImage, optimize: async () => undefined, pack: prepareReaderPack,
  }
  try {
    const event = JSON.stringify({ id: 'new-report-event', type: 'page.created', entity: { type: 'page', id } })
    const response = await worker.fetch(new Request('https://fixture.invalid/api/notion/webhook', { method: 'POST', body: event,
      headers: { 'x-notion-signature': `sha256=${createHmac('sha256', env.NOTION_WEBHOOK_VERIFICATION_TOKEN!).update(event).digest('hex')}` } }), env, ctx)
    assert.equal(response.status, 200)
    await Promise.all(pending)
    assert.equal(dispatches, 1)
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now())
    const { job } = await (await internal(jobRequest('claim'), env)).json() as any
    const blocks = await prepareBody(env, job.item, 'https://fixture.invalid/')
    const cover = await prepareCover(job.item, job.cover, dependencies)
    assert.equal(cover?.reader?.pageCount, 4)
    assert.equal(cover.reader.pages.length, 3)
    assert.ok(cover.reader.pagePack)
    assert.equal(downloads, 1)
    assert.equal((await internal(jobRequest(`${id}/complete`, { ...job, blocks, cover }), env)).status, 200)
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM free_jobs').get()!.n, 0)

    const detail = await (await call(`/api/detail/research/${id}`)).json() as { item: ContentItem & { cover: PublicCover }; bodyPending: boolean }
    assert.equal(detail.bodyPending, false)
    const reader = detail.item.cover.reader!
    assert.ok(reader.pack); assert.ok(reader.packSource)
    const packUrl = `/api/content/research/${id}/pdf?source=external&prepared=${reader.packSource}&pages=${reader.pack.key}`
    const loader = createPagePackLoader(`/api/content/research/${id}/pdf?source=external`, reader.packSource, reader.pack, 4, url => call(String(url)))
    try {
      const pages = await loader.readAll(new AbortController().signal)
      assert.deepEqual(pages?.map(p => p.page), [1, 2, 3, 4])
      for (const image of pages!) URL.revokeObjectURL(image.url)
      const last = await loader.read(4, new AbortController().signal)
      assert.equal(last?.width, 2048)
      const image = await (await fetch(last!.url)).arrayBuffer()
      const pixel = await sharp(Buffer.from(image)).extract({ left: 10, top: 10, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
      assert.ok(pixel[1] > 180 && pixel[0] < 10, 'page four must contain its own rendered PDF pixels')
      URL.revokeObjectURL(last!.url)
      assert.equal(assetReads, 1, 'paging and zooming reuse the single whole-document request')
    } finally { loader.dispose() }

    const reused = await prepareCover(job.item, cover, dependencies)
    assert.equal(reused?.reader?.pagePack?.url, cover.reader.pagePack.url)
    assert.equal(renders, 1, 'same PDF reuses both previews and the real pack on disk')

    page = { ...page, last_edited_time: '2026-01-02T00:00:00.000Z' }
    await storePage(env, page, 'research')
    assert.equal((await internal(jobRequest(`${id}/complete`, { ...job, blocks, cover }), env)).status, 409)
    assert.equal((await call(packUrl)).status, 404, 'an edited report cannot keep serving the previous reading edition')
    const { job: replacement } = await (await internal(jobRequest('claim'), env)).json() as any
    pdf = reportPdf(true)
    const changed = await prepareCover(replacement.item, replacement.cover, dependencies)
    assert.notEqual(changed?.pdfHash, cover.pdfHash)
    assert.notEqual(changed?.reader?.pagePack?.url, cover.reader.pagePack.url)
    assert.equal((await internal(jobRequest(`${id}/complete`, { ...replacement, blocks, cover: changed }), env)).status, 200)
    assert.equal((await call(packUrl)).status, 404, 'a stale reader tab cannot receive mismatched replacement pages')

    page = { ...page, last_edited_time: '2026-01-03T00:00:00.000Z', properties: { ...page.properties, 공개: { type: 'checkbox', checkbox: false } } }
    await storePage(env, page, 'research')
    assert.equal((await call(`/api/detail/research/${id}`)).status, 404)
    assert.equal((await call(packUrl)).status, 404)
  } finally {
    await Promise.allSettled(pending)
    sqlite.close()
    await Promise.all(['covers', 'reader-pdfs'].map(folder => rm(`.smp-cache/${folder}/${id}`, { recursive: true, force: true })))
  }
})
