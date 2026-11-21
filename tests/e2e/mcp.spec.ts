import { test, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('Playwright MCP connects and navigates the isolated local website', async ({}, testInfo) => {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/check-qa-mcp.mjs'], { timeout: 55_000 })
  const result = JSON.parse(stdout.trim())
  expect(result.localNavigation).toBe('passed')
  expect(result.snapshot).toBe('passed')
  await testInfo.attach('mcp-check', { body: JSON.stringify(result), contentType: 'application/json' })
})
