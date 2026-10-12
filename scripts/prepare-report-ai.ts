import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { REPORT_AI_PILOT_IDS, validReportAiSummary, validateSummaryEvidence } from "../lib/report-ai-summary"
import { extractSummaryPages, generateReportSummary, SummaryEvidenceError } from "../free/jobs/report-ai"
import { remoteDatabase } from "../free/jobs/database"
import { downloadPdfForPreview } from "../lib/pdf-preview-render"
import { getPdfSources } from "../lib/pdf-source"
import type { ContentItem } from "../lib/content-model"

// Explicit, manual pilot command. It is deliberately absent from the scheduled
// publisher and has no public HTTP endpoint. Drafts never publish themselves.
async function main() {
  const [id, option] = process.argv.slice(2)
  if (!(REPORT_AI_PILOT_IDS as readonly string[]).includes(id) || (option && option !== "--from-cache")) throw new Error("Choose one configured pilot report")
  const required = (key:string) => { const value=process.env[key];if(!value)throw new Error(`Missing ${key}`);return value }
  const account=required("CLOUDFLARE_ACCOUNT_ID"), database=required("SMP_FREE_DATABASE_ID")
  if (database === "16cf8db5-1f95-48f3-af68-b32cfa7f7908") throw new Error("Use the production shared budget, not the fixture database")
  const db=remoteDatabase(account,database,required("CLOUDFLARE_API_TOKEN"))
  const response=await fetch(`https://pnusmp.com/api/detail/research/${id}`,{redirect:"error",signal:AbortSignal.timeout(20_000)})
  if(!response.ok)throw new Error("Pilot report is not publicly available")
  const {item,bodyPending}=await response.json() as {item:ContentItem;bodyPending:boolean}
  if(item.id!==id || item.kind!=="research" || bodyPending)throw new Error("Wait for the current public PDF preparation")
  const pdf=getPdfSources(item)[0];if(!pdf)throw new Error("No report PDF")
  const directory=".smp-cache/ai-pilot";await mkdir(directory,{recursive:true})
  let bytes:Uint8Array
  if(option==="--from-cache") {
    const saved=JSON.parse(await readFile(`${directory}/${id}.json`,"utf8"))
    if(saved.item?.editedAt!==item.editedAt || saved.item?.externalUrl!==item.externalUrl)throw new Error("Cached PDF metadata changed; download it again")
    bytes=await readFile(`${directory}/${id}.pdf`)
    if(createHash("sha256").update(bytes).digest("hex")!==saved.pdfHash)throw new Error("Cached PDF integrity check failed")
  } else bytes=await downloadPdfForPreview(pdf.url)
  const source={reportId:id,pdfHash:createHash("sha256").update(bytes).digest("hex"),reportDate:item.date,pages:await extractSummaryPages(bytes)}
  const target=`${directory}/${id}-${source.pdfHash}.draft.json`
  try {
    const cached=JSON.parse(await readFile(target,"utf8"))
    if(validReportAiSummary(cached.summary)&&cached.summary.reportId===id&&cached.summary.pdfHash===source.pdfHash){validateSummaryEvidence(cached.summary,source.pages);console.log(JSON.stringify({id,reused:true,file:target}));return}
  } catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error }
  let result
  try { result=await generateReportSummary(source,{account,token:required("CLOUDFLARE_AI_TOKEN"),db,
    onResponse: async response => { await writeFile(target.replace(".draft.json",`.response-${response.attempt}.json`),JSON.stringify(response,null,2)+"\n") },
  }) }
  catch (error) {
    if (error instanceof SummaryEvidenceError) {
      const rejected=target.replace(".draft.json",".rejected.json")
      await writeFile(rejected,JSON.stringify({...error.draft,validationError:error.message},null,2)+"\n")
      throw new Error(`Draft needs source review: ${rejected} (${error.message})`)
    }
    throw error
  }
  await writeFile(target,JSON.stringify(result,null,2)+"\n")
  console.log(JSON.stringify({id,file:target,pages:source.pages.length,attempt:result.attempt,usage:result.usage}))
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Pilot preparation failed");process.exitCode=1})
