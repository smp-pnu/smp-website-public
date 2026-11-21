import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, registerTestAdmin, adminApi, connectTestDrive, noPageOverflow, adminOrigin } from './fixtures'
import { emptySitePeriod, siteDate, siteStart } from '../../admin-lab/site-model'

const captures = path.resolve('.smp-cache/design-polish')
async function capture(page: import('@playwright/test').Page, name: string) {
  await mkdir(captures, { recursive: true })
  await page.screenshot({ path: path.join(captures, name + '.png'), fullPage: true, animations: 'disabled', scale: 'css' })
}
const widths = [390, 768, 1440]

test.describe('Admin design and navigation', () => {
  test.use({ baseURL: adminOrigin, ignoreHTTPSErrors: true })
  test.beforeEach(async ({ page, context }) => { await registerTestAdmin(page, context) })

  test('Dashboard views reuse snapshots and preserve detailed metrics', async ({ page }, info) => {
    const now = Date.now()
    const reports = Array.from({ length: 8 }, (_, i) => ({ id: (i + 1).toString(16).padStart(32, '0'), title: `[미리보기] ${['인바디 — 새로운 성장의 시작', '한국콜마 — 연구에서 경쟁력으로', 'RF머트리얼즈', 'HPSP'][i % 4]}`, visibility: 'public', views: 92 - i * 9, downloads: 30 - i * 3, failed: 0 }))
    const period = { ...emptySitePeriod(), downloads: 45, lastDownloadAt: now - 500000, started: 52, ready: 49, failed: 1, averageMs: 850, reports,
      traffic: { visits: 241, views: 684, lastViewAt: now - 600000, reports: [], daily: Array.from({ length: 7 }, (_, i) => ({ day: siteDate(siteStart(now, 7) + i * 86400000), views: 40 + i * 12, visits: 20 + i * 4 })), referrers: [{ host: 'google.com', visits: 91 }, { host: 'naver.com', visits: 64 }] } }
    await page.route('**/api/dashboard/site', route => route.fulfill({ json: { startedAt: now - 30 * 86400000, checkedAt: now, trafficCheckedAt: now, trafficError: false, limitedDays: [], periods: { 1: period, 7: period, 30: period } } }))
    await page.route('**/api/dashboard/cloudflare', route => route.fulfill({ json: {
      workers: { checkedAt: now, error: false, value: { requests: 2400, errors: 0, resourceErrors: 0, scripts: [{ name: 'smp-website-free', requests: 2400, errors: 0, p50Ms: 1, p99Ms: 3.4 }] } },
      rows: { checkedAt: now, error: false, value: { read: 12000, written: 90 } },
      storage: { checkedAt: now, error: false, value: { bytes: 82000000, databases: [{ name: '미리보기 DB', bytes: 82000000 }] } },
    } }))
    await connectTestDrive(page)
    await page.route('**/api/dashboard/drive', route => route.fulfill({ json: { value: { connected: true, email: 'preview@example.test', folderUrl: null, quota: { limit: 15 * 1024 ** 3, usage: 3 * 1024 ** 3, remaining: 12 * 1024 ** 3, drive: 2 * 1024 ** 3, trash: 0, other: 1024 ** 3 } }, checkedAt: now, nextCheckAt: now + 600000, stale: false } }))
    const calls: string[] = []
    page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/dashboard')) calls.push(new URL(req.url()).pathname) })
    await page.reload()
    await expect(page.locator('.site-metrics strong').filter({ hasText: '684' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'PDF 보관 현황' })).toBeHidden()
    for (const width of info.project.name === 'desktop' ? widths : [390]) {
      await page.setViewportSize({ width, height: 960 })
      await noPageOverflow(page)
      await capture(page, `admin-dashboard-${width}`)
    }
    const countBefore = calls.length
    await page.getByRole('button', { name: '방문·리포트', exact: true }).click()
    await expect(page.getByRole('heading', { name: '유입 경로' })).toBeVisible()
    await page.getByRole('button', { name: '저장 공간·처리량', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'PDF 보관 현황' })).toBeVisible()
    await page.getByRole('button', { name: '요약', exact: true }).click()
    expect(calls.length, 'Changing the view must reuse fetched values').toBe(countBefore)
    await noPageOverflow(page)
  })

  test('Upload storage return survives reload but does not leak to ordinary settings', async ({ page }) => {
    await connectTestDrive(page)
    await page.goto('/#upload')
    await page.getByRole('button', { name: '연결 관리', exact: true }).click()
    await expect(page.getByText('저장소가 연결되어 있습니다', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: '리포트 등록 계속하기' })).toBeEnabled()
    await page.getByRole('button', { name: '리포트 등록 계속하기' }).click()
    await expect(page.getByLabel('등록할 PDF 선택')).toBeEnabled()
    if (await page.getByRole('button', { name: '관리 메뉴 열기' }).isVisible()) await page.getByRole('button', { name: '관리 메뉴 열기' }).click()
    await page.locator('.admin-sidebar').getByRole('button', { name: '파일 저장소', exact: true }).click()
    await expect(page.getByRole('heading', { name: '파일 저장소' })).toBeVisible()
    await expect(page.getByRole('button', { name: '리포트 등록 계속하기' })).toHaveCount(0)
    await noPageOverflow(page)
  })

  test('Long notice editing keeps save actions reachable across screen sizes', async ({ page }, info) => {
    const titles = ['2027년 상반기 신입 학회원 모집 안내', 'SMP 부산 홈커밍데이', '정기 세션 일정 및 준비사항', '금융투자학회 회칙 안내']
    let firstId = ''
    for (const title of titles) {
      const entry = await adminApi(page, '/cms/notice', 'POST', { item: { id: '', kind: 'notice', title: `[미리보기] ${title}`, date: '2026-11-21', summary: '화면 검증을 위한 가상 자료입니다.', category: '학회 소식', author: 'SMP', pinned: false, externalUrl: null, attachments: [] }, blocks: Array.from({ length: 15 }, (_, i) => ({ id: randomUUID().replaceAll('-', ''), type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '학회의 소식을 전합니다. 내용과 공개 상태를 확인한 뒤 게시해 주세요.' }, plain_text: '학회의 소식을 전합니다. 내용과 공개 상태를 확인한 뒤 게시해 주세요.' }] } })), cover: null })
      firstId ||= entry.id
    }
    for (const width of info.project.name === 'desktop' ? widths : [390]) {
      await page.setViewportSize({ width, height: 960 })
      await page.goto('/#notice')
      await expect(page.getByRole('button', { name: '[미리보기] ' + titles[0], exact: true })).toBeVisible()
      await noPageOverflow(page)
      await capture(page, `admin-notice-list-${width}`)
      await page.getByRole('button', { name: '[미리보기] ' + titles[0], exact: true }).click()
      await expect(page.getByRole('textbox', { name: '공지 본문' })).toBeVisible()
      await page.getByLabel('공지 제목', { exact: true }).fill('[미리보기] ' + titles[0] + ' 수정')
      await page.evaluate(() => window.scrollTo(0, 900))
      const save = page.getByRole('button', { name: '초안 저장', exact: true })
      const box = await save.boundingBox()
      expect(box && box.y >= 0 && box.y + box.height <= 960, 'Save stays in the viewport while editing').toBe(true)
      await noPageOverflow(page)
      await capture(page, `admin-notice-editor-${width}`)
      await save.click()
      await expect(save).toBeDisabled()
      // Restore only the synthetic title, keeping the next iteration independent.
      await page.getByLabel('공지 제목', { exact: true }).fill('[미리보기] ' + titles[0])
      await save.click()
      await expect(save).toBeDisabled()
      await expect(page.getByLabel('공지 제목', { exact: true })).toBeEnabled()
      await page.getByRole('button', { name: '공지 목록으로', exact: true }).click()
      await expect(page.getByRole('heading', { name: '공지사항', exact: true })).toBeVisible()
    }
    expect(firstId).toHaveLength(32)
  })
})

test('Public pages retain readable layouts and report selection with reduced motion', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Explicit widths include mobile')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await noPageOverflow(page)
    await capture(page, `home-${width}`)
    const selectors = page.locator('.report-exhibit__selectors button')
    await expect(selectors.first()).toBeVisible()
    await selectors.last().click()
    await expect(selectors.last()).toHaveAttribute('aria-pressed', 'true')
    await noPageOverflow(page)
    await page.locator('.report-exhibit').screenshot({ path: path.join(captures, `home-reports-${width}.png`), animations: 'disabled' })
    const catalogue = await (await page.request.get('/api/catalog/research')).json()
    const companies = ['인바디', '한국콜마', 'RF머트리얼즈', 'HPSP']
    await page.route('**/api/catalog/research', route => route.fulfill({ json: { ...catalogue, items: catalogue.items.slice(0, 4).map((item: Record<string, unknown>, index: number) => ({ ...item, company: companies[index], title: `[미리보기] ${companies[index]} — 기업의 가치를 발견하다` })) } }))
    await page.goto('/')
    await page.reload()
    await expect(selectors).toHaveCount(4)
    await selectors.first().focus()
    await selectors.first().press('ArrowRight')
    await expect(selectors.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await noPageOverflow(page)
    const paper = await page.locator('.report-exhibit__panel[data-active=true] .report-exhibit__paper').boundingBox()
    const link = await page.locator('.report-exhibit__panel[data-active=true] .report-exhibit__cover-action span').boundingBox()
    expect(paper && link && paper.y + paper.height <= link.y, 'Cover must not overlap its read link').toBe(true)
    await page.locator('.report-exhibit').screenshot({ path: path.join(captures, `home-reports-four-${width}.png`), animations: 'disabled', scale: 'css' })
    await page.unroute('**/api/catalog/research')
    await page.goto('/about')
    await expect(page.getByRole('heading', { name: 'ABOUT SMP', exact: true })).toBeVisible()
    await noPageOverflow(page)
    await capture(page, `about-${width}`)
  }
})
