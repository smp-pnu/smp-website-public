import "server-only"
import { canonicalIndustry } from "./wics"

export type CompanyRecord = { ticker: string; company: string; industry: string; aliases?: string[]; historical?: boolean }
const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()

// Only a validated six-digit code enters a fixed public endpoint. Never follow
// provider redirects, accept arbitrary URLs, or log the returned HTML.
export async function lookupCompany(ticker: string): Promise<CompanyRecord | null> {
  if (!/^\d{6}$/.test(ticker)) return null
  const response = await fetch(`https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${ticker}`, {
    redirect: "error", signal: AbortSignal.timeout(8_000), cache: "no-store",
  })
  if (!response.ok || !response.body) throw new Error("Company lookup unavailable")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > 1_000_000) { await reader.cancel(); throw new Error("Company response too large") }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const html = Buffer.concat(chunks).toString("utf8")
  const company = decode(html.match(/<span\s+class="name">([^<]+)<\/span>/)?.[1] ?? "")
  const industry = canonicalIndustry(decode(html.match(/<dt[^>]*>WICS\s*:\s*([^<]+)<\/dt>/)?.[1] ?? ""))
  // A layout change or missing classification is a review case, never a guess.
  if (!company || company.length > 100 || !industry) return null
  return { ticker, company, industry }
}
