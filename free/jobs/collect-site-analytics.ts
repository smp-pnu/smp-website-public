import {remoteDatabase} from './database'
import {collectSiteAnalytics} from './site-analytics'
async function main(){
 if(process.env.SMP_FREE_DEPLOY_APPROVED!=='1')throw Error('Publisher disabled')
 const account=process.env.CLOUDFLARE_ACCOUNT_ID||'',token=process.env.CLOUDFLARE_API_TOKEN||'',database=process.env.SMP_FREE_DATABASE_ID||''
 const result=await collectSiteAnalytics(remoteDatabase(account,database,token),{account,token})
 console.log(result.skipped?'Site snapshot is recent; collection skipped.':result.failed?'Site traffic collection unavailable; previous values retained.':'Site analytics snapshot updated.')
 if(result.failed)process.exitCode=1
}
void main().catch(()=>{console.error('Site analytics unavailable; publishing remains independent.');process.exitCode=1})
