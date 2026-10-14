import assert from "node:assert/strict"
import test from "node:test"
import { cmsImageUrl } from "../lib/cms-image-url"

test("known legacy CMS images use the current static site", () => {
  assert.equal(cmsImageUrl("https://smp-pnu.vercel.app/backgrounds/pnu-campus-upscaled.webp"), "https://pnusmp.com/backgrounds/pnu-campus-upscaled.webp")
  assert.equal(cmsImageUrl("https://smp-pnu.vercel.app/backgrounds/research-desk.webp"), "https://pnusmp.com/backgrounds/research-desk.webp")
})

test("migration does not rewrite other origins, credentials or unknown paths", () => {
  for (const url of ["https://example.com/backgrounds/research-desk.webp", "https://smp-pnu.vercel.app.example.com/backgrounds/research-desk.webp",
    "http://smp-pnu.vercel.app/backgrounds/research-desk.webp", "https://user@smp-pnu.vercel.app/backgrounds/research-desk.webp",
    "https://smp-pnu.vercel.app/api/private", "not a URL"]) assert.equal(cmsImageUrl(url), url)
})
