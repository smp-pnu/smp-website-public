import { test as base, expect, type Page, type BrowserContext } from '@playwright/test'
export const adminOrigin = 'https://localhost:3019'
const origins = new Set(['http://127.0.0.1:3005', adminOrigin])

export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ context, page }, use, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      return origins.has(url.origin) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient')
    })
    await use(errors)
    if (errors.length) await testInfo.attach('browser-errors', { body: errors.join('\n'), contentType: 'text/plain' })
    expect(errors, 'No uncaught browser errors').toEqual([])
  }, { auto: true }],
})
export { expect }

export async function registerTestAdmin(page: Page, context: BrowserContext) {
  const reset = await context.request.post(adminOrigin + '/__qa/reset', { headers: { 'X-SMP-QA': 'local-only' } })
  expect(reset.ok()).toBeTruthy()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  await page.goto(adminOrigin)
  await expect(page.getByRole('heading', { name: '첫 관리자 패스키 등록' })).toBeVisible()
  await page.getByLabel('초기 설정 키 (64자리)').fill('b'.repeat(64))
  await page.getByLabel('기기 이름', { exact: true }).fill('QA synthetic device')
  await page.getByRole('button', { name: '패스키 등록하고 시작' }).click()
  await page.getByLabel('다른 안전한 곳에 보관했습니다.').check()
  await page.getByRole('button', { name: '관리자 화면으로' }).click()
  await expect(page.getByRole('heading', { name: '운영 현황', exact: true })).toBeVisible()
}

export async function adminApi(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const { session } = await (await fetch('/api/session')).json()
    const response = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    if (!response.ok) throw Error(`${method} ${path}: ${response.status} ${await response.text()}`)
    return response.json()
  }, { path, method, body })
}

export async function connectTestDrive(page: Page) {
  await adminApi(page, '/storage/drive/configure', 'POST', { web: { client_id: '123-test.apps.googleusercontent.com', client_secret: 'local-test-secret-only', redirect_uris: [adminOrigin + '/api/storage/drive/callback'] } })
  const { url } = await adminApi(page, '/storage/drive/start', 'POST')
  const state = new URL(url).searchParams.get('state')!
  const response = await page.context().request.get(adminOrigin + '/api/storage/drive/callback?' + new URLSearchParams({ state, code: 'local-test-code' }), { maxRedirects: 0 })
  expect(response.status()).toBe(303)
  await adminApi(page, '/storage/drive/confirm', 'POST')
}

export async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Page must fit the viewport').toBe(true)
}
