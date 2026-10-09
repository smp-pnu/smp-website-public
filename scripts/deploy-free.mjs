import { readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
const config = JSON.parse(await readFile("dist/free/wrangler.json","utf8"))
const info = JSON.parse(await readFile("dist/free/build-info.json","utf8"))
if (process.argv.slice(2).some(arg=>arg!=="--dry-run")) throw new Error("Unsupported deploy argument")
if (info.fixture) {
  if(config.name!=="smp-fixture-preview" || config.vars.SMP_READ_ONLY!=="1") throw new Error("Invalid fixture deployment")
} else if(process.env.SMP_FREE_DEPLOY_APPROVED!=="1" || config.name!=="smp-website-free" || config.d1_databases[0].database_id!==process.env.SMP_FREE_DATABASE_ID || config.d1_databases[0].database_id==="16cf8db5-1f95-48f3-af68-b32cfa7f7908") {
  throw new Error("Production publishing must be explicitly enabled with a separate database")
}
const result=spawnSync(process.execPath,["node_modules/wrangler/bin/wrangler.js","deploy","--config","dist/free/wrangler.json",...process.argv.slice(2)],{stdio:"inherit",env:process.env})
process.exitCode=result.status??1
if(result.status===0 && !info.fixture) for(const kind of ["research","notice","members"]) {
  const file=`dist/free/sync-${kind}.json`,sync=JSON.parse(await readFile(file,"utf8"))
  if(sync.name!==`smp-sync-${kind}` || sync.workers_dev!==false || sync.vars.SMP_SYNC_KIND!==kind || sync.d1_databases[0].database_id!==process.env.SMP_FREE_DATABASE_ID)throw new Error("Invalid source sync deployment")
  const child=spawnSync(process.execPath,["node_modules/wrangler/bin/wrangler.js","deploy","--config",file,...process.argv.slice(2)],{stdio:"inherit",env:process.env})
  if(child.status!==0){process.exitCode=child.status??1;break}
}
