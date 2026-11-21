import type { Page } from '@playwright/test'

// Supplement MCP's allowlist: intercept subresources and redirects as well.
export default async ({ page }: { page: Page }) => {
  const allowed = new Set(['http://127.0.0.1:3005', 'https://localhost:3019'])
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url())
    return allowed.has(url.origin) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient')
  })
}
