import {remoteDatabase} from "./database"
import {collectCloudUsage} from "./cloudflare-metrics"

async function main() {
  if(process.env.SMP_FREE_DEPLOY_APPROVED!=="1")throw Error("Publisher is not enabled")
  const account=process.env.CLOUDFLARE_ACCOUNT_ID||"",token=process.env.CLOUDFLARE_API_TOKEN||"",database=process.env.SMP_FREE_DATABASE_ID||""
  const result=await collectCloudUsage(remoteDatabase(account,database,token),{account,token})
  // Public Actions logs must never include account metrics or remote messages.
  console.log(result.skipped?"Cloud usage snapshot is recent; collection skipped.":result.failed?"Cloud usage collection partially unavailable; previous values retained.":"Cloud usage snapshot updated.")
  if(result.failed)process.exitCode=1
}
void main().catch(()=>{console.error("Cloud usage collection unavailable; publishing remains independent.");process.exitCode=1})
