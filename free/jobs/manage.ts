import {writeFile} from "node:fs/promises"
import {remoteDatabase} from "./database"
import {ensureJobFailures} from "./job-schema"
import {ensureSyncRuns} from "./sync-schema"
import {maintenanceInput,managePublication,publicationStatus} from "./maintenance"
const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);return value}
async function main() {
  if(process.env.SMP_FREE_DEPLOY_APPROVED!=="1") throw new Error("Production maintenance has not been enabled")
  const database=required("SMP_FREE_DATABASE_ID")
  if(database==="16cf8db5-1f95-48f3-af68-b32cfa7f7908") throw new Error("Production maintenance cannot use the trial database")
  const input=maintenanceInput(process.env.SMP_CMS_OPERATION||"publish",process.env.SMP_CMS_PAGE_ID||"")
  const db=remoteDatabase(required("CLOUDFLARE_ACCOUNT_ID"),database,required("CLOUDFLARE_API_TOKEN"))
  await ensureJobFailures(db);await ensureSyncRuns(db)
  const queued=await managePublication(db,input.operation,input.id)
  const status=await publicationStatus(db)
  // Counts, public page IDs and fixed error codes only: no URLs, body, tokens,
  // error messages or member identity fields enter public workflow logs.
  const text=JSON.stringify({operation:input.operation,queued,...status},null,2)
  console.log(text)
  if(process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,`## CMS 운영 상태\n\n\`\`\`json\n${text}\n\`\`\`\n`,{flag:"a"})
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Maintenance failed");process.exitCode=1})
