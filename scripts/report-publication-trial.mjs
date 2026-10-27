// Explicit, one-shot online rehearsal. Never loads .env or deploys production.
import path from 'node:path'
import {readFile,writeFile,mkdir,cp,rm,readdir,stat,chmod} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {gzipSync} from 'node:zlib'
import {build} from 'esbuild'
import {HttpReportSource} from '../admin-publisher/source.ts'
import {localDatabase,initPreview} from '../admin-publisher/local-database.ts'
import {LocalPublicationAssets} from '../admin-publisher/assets.ts'
import {publishReports} from '../admin-publisher/runner.ts'
import {assertPreviewDatabase} from '../admin-publisher/target.ts'

const root=path.resolve(import.meta.dirname,'..'), [mode,flag,directory]=process.argv.slice(2)
const name='smp-report-publication-trial',account='f4dcd5f46e5ca4400e2b3449ea5e4497'
const origin=`https://${name}.smp-website.workers.dev`
if(!['prepare','build','deploy','dry-run'].includes(mode)||flag!=='--out'||!path.isAbsolute(directory??'')||process.argv.length!==5)throw Error('Use prepare|build|deploy|dry-run --out /absolute/private/rehearsal')
const out=path.resolve(directory)
if(out===path.parse(out).root||out===root||out.startsWith(root+path.sep))throw Error('Keep report data outside the repository')
const cfgPath=path.join(out,'deployment/wrangler.json')
const targetPath=path.join(root,'.smp-tools/report-publication-trial-target.json')
const run=(args,options={})=>{
  const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',...options})
  if(r.status!==0)throw Error(`Trial command failed: ${args.slice(1,4).join(' ')}\n${r.stderr??''}`)
  return r.stdout
}
const wrangler=(args)=>run(['node_modules/wrangler/bin/wrangler.js',...args,'--config',cfgPath])
const quote=value=>value===null?'NULL':typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`
const forbiddenDbIds=['9adf0c20-4ccb-4d18-a3ea-a9b0c3cf6c34','c09abb5e-02cd-4277-8b19-0af0642f7cae','16cf8db5-1f95-48f3-af68-b32cfa7f7908']

if(mode==='prepare') {
  const grant=JSON.parse(await readFile(path.join(root,'.smp-tools/report-export-grant.json'),'utf8'))
  const scope=JSON.parse(grant.REPORT_EXPORT_SCOPE)
  if(scope.expires<=Date.now()||scope.ids.length>2)throw Error('Invalid or expired trial grant')
  const marker={mode:'actual-admin-isolated-trial',origin,ids:scope.ids}
  try {
    await mkdir(out,{mode:0o700})
    await writeFile(path.join(out,'rehearsal.json'),JSON.stringify(marker),{mode:0o600,flag:'wx'})
  } catch(error) {
    if(error.code!=='EEXIST')throw error
    if(JSON.stringify(JSON.parse(await readFile(path.join(out,'rehearsal.json'),'utf8')))!==JSON.stringify(marker))throw Error('Existing directory is not this report rehearsal')
  }
  const source=new HttpReportSource('https://admin.pnusmp.com',grant.REPORT_EXPORT_KEY)
  const before=await source.snapshot()
  if(before.reports.length!==scope.ids.length||before.reports.some(r=>!scope.ids.includes(r.id)))throw Error('Every selected report must be approved before preparing this trial')
  const target=localDatabase(path.join(out,'preview.sqlite'))
  try {
    if(target.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='preview_config'").get())await assertPreviewDatabase(target.db)
    else await initPreview(target.sqlite)
    const assets=new LocalPublicationAssets(path.join(out,'assets'));await assets.init()
    const result=await publishReports(source,target.db,assets)
    const ready=target.sqlite.prepare('SELECT id FROM preview_reports').all()
    if(result.failed||result.deferred||ready.length!==before.reports.length||ready.some(r=>!scope.ids.includes(r.id)))throw Error('Trial publication incomplete; existing service unchanged')
    const snapshot=await source.snapshot()
    if(snapshot.fingerprint!==before.fingerprint)throw Error('Approval changed during preparation')
    await writeFile(path.join(out,'approval.json'),JSON.stringify(snapshot,null,2),{mode:0o600})
    await writeFile(path.join(out,'verification.json'),JSON.stringify({version:1,mode:'actual-admin-isolated-trial',origin,fingerprint:snapshot.fingerprint,reportIds:scope.ids,result,sourceRequests:source.requests,assetBytes:assets.bytes,assetFiles:assets.files,preparedAt:new Date().toISOString(),productionModified:false},null,2),{mode:0o600})
    console.log(JSON.stringify({prepared:result.prepared,requests:source.requests,assetMiB:+(assets.bytes/1024**2).toFixed(2)}))
  } finally {target.sqlite.close();await chmod(path.join(out,'preview.sqlite'),0o600)}
} else if(mode==='build') {
  const info=JSON.parse(await readFile(path.join(out,'verification.json'),'utf8'))
  const target=JSON.parse(await readFile(targetPath,'utf8'))
  if(info.mode!=='actual-admin-isolated-trial'||info.origin!==origin||!Array.isArray(info.reportIds)||info.reportIds.length>2)throw Error('Not a verified live rehearsal')
  if(!/^[a-f0-9-]{36}$/.test(target.databaseId)||forbiddenDbIds.includes(target.databaseId))throw Error('A separate trial database is required')
  const deployment=path.join(out,'deployment'),client=path.join(deployment,'client')
  await mkdir(deployment,{recursive:true,mode:0o700})
  await cp(path.join(root,'dist/free/client'),client,{recursive:true})
  // Remove fixture content and all previously copied report assets.
  for(const entry of await readdir(client))if(entry.endsWith('.html')&&entry!=='page-shell.html')await rm(path.join(client,entry))
  for(const entry of ['report-covers','_reader-pdfs','api','sitemap.xml','sitemap-research.xml','sitemap-notice.xml','feed.xml'])await rm(path.join(client,entry),{recursive:true,force:true})
  await cp(path.join(out,'assets'),client,{recursive:true})
  const shellPath=path.join(client,'page-shell.html'),shell=await readFile(shellPath,'utf8')
  const banner='<aside style="position:fixed;bottom:12px;left:12px;z-index:9999;padding:9px 14px;border:1px solid #8195a4;border-radius:6px;background:#17212deb;color:#f1f5f9;font:13px sans-serif">리포트 게시 시험 · 운영 사이트와 별도</aside>'
  await writeFile(shellPath,shell.replace('</body>',banner+'</body>'))
  await writeFile(path.join(client,'robots.txt'),'User-agent: *\nDisallow: /\n')
  const headers=await readFile(path.join(client,'_headers'),'utf8')
  await writeFile(path.join(client,'_headers'),headers.replace(/^  X-Robots-Tag:.*\n/gm,'').replace(/^\/\*\n/,'/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n'))
  const local=localDatabase(path.join(out,'preview.sqlite'))
  try {
    let sql=''
    for(const file of ['0002_free_runtime','0003_free_guards','0004_document_versions','0006_report_cover_cache','0008_publication_checks','0009_job_failures'])sql+=await readFile(path.join(root,'cloudflare/migrations',file+'.sql'),'utf8')+'\n'
    sql+=await readFile(path.join(root,'admin-publisher/schema.sql'),'utf8')+'\n'
    // Allowlist only public/approved state. Credentials, drafts and raw PDFs
    // never enter the trial D1 copy, source code or JavaScript bundle.
    for(const table of ['preview_reports','free_content','free_documents','free_sync'])for(const row of local.sqlite.prepare(`SELECT * FROM ${table}`).all())
      sql+=`INSERT OR REPLACE INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});\n`
    sql+=`INSERT OR REPLACE INTO preview_config VALUES('snapshot',${quote(info.fingerprint)});\n`
    if(Buffer.byteLength(sql)>512*1024)throw Error('Trial metadata exceeds import budget')
    await writeFile(path.join(deployment,'seed.sql'),sql,{mode:0o600})
  } finally {local.sqlite.close()}
  await build({entryPoints:[path.join(root,'admin-publisher/trial-worker.ts')],outfile:path.join(deployment,'worker.js'),bundle:true,minify:true,format:'esm',platform:'neutral',target:'es2022',external:['node:*'],define:{__SMP_FIXTURE__:'true'},plugins:[{name:'server-marker',setup(api){api.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'marker'}));api.onLoad({filter:/.*/,namespace:'marker'},()=>({contents:'export {}'}))}}]})
  let files=0,bytes=0
  const scan=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Symlink in assets');if(entry.isDirectory())await scan(file);else{const size=(await stat(file)).size;if(size>25*1024**2)throw Error('Asset exceeds free static file limit');files++;bytes+=size}}}
  await scan(client)
  if(files>2000||bytes>256*1024**2)throw Error('Trial static asset budget exceeded')
  const worker=await readFile(path.join(deployment,'worker.js'))
  if(gzipSync(worker).length>2.5*1024**2)throw Error('Trial Worker exceeds the free script size safety budget')
  const config={name,account_id:account,main:'worker.js',no_bundle:true,find_additional_modules:false,compatibility_date:'2026-10-09',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,
    assets:{directory:'client',binding:'ASSETS',html_handling:'drop-trailing-slash',not_found_handling:'none',run_worker_first:['/','/research','/research/*','/api/*','/_*','/%*','/report-covers/*','/robots.txt']},
    d1_databases:[{binding:'CMS_DB',database_name:name,database_id:target.databaseId}],
    vars:{TRIAL_ORIGIN:origin,TRIAL_VALID_UNTIL:String(Date.now()+7*86400000)},ratelimits:[{name:'API_RATE_LIMIT',namespace_id:'2026102702',simple:{limit:60,period:60}}],observability:{enabled:false}}
  await writeFile(cfgPath,JSON.stringify(config,null,2),{mode:0o600})
  await writeFile(path.join(deployment,'build-info.json'),JSON.stringify({fingerprint:info.fingerprint,files,bytes,workerBytes:worker.length,workerGzipBytes:gzipSync(worker).length,workerSha256:createHash('sha256').update(worker).digest('hex')},null,2),{mode:0o600})
  console.log(JSON.stringify({files,assetMiB:+(bytes/1024**2).toFixed(2),origin}))
} else {
  const config=JSON.parse(await readFile(cfgPath,'utf8')),target=JSON.parse(await readFile(targetPath,'utf8')),info=JSON.parse(await readFile(path.join(out,'verification.json'),'utf8'))
  if(config.name!==name||config.account_id!==account||config.find_additional_modules!==false||config.no_bundle!==true||config.route||config.routes||config.services||config.triggers||config.ai||config.r2_buckets||config.kv_namespaces||config.vars.TRIAL_ORIGIN!==origin
    ||config.d1_databases?.length!==1||config.d1_databases[0].database_id!==target.databaseId||config.d1_databases[0].database_name!==name||forbiddenDbIds.includes(target.databaseId))throw Error('Refusing deployment outside the report publication trial')
  if(mode==='deploy') {
    const remote=JSON.parse(wrangler(['d1','info',name,'--json']))
    if(remote.uuid!==target.databaseId||remote.name!==name)throw Error('Remote trial database mismatch')
    const state=JSON.parse(wrangler(['d1','execute',name,'--remote','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='preview_config'",'--json']))[0].results
    if(state.length) {
      const snapshot=JSON.parse(wrangler(['d1','execute',name,'--remote','--command',"SELECT value FROM preview_config WHERE key='snapshot'",'--json']))[0].results[0]
      if(snapshot?.value!==info.fingerprint)throw Error('Trial already has a different snapshot; refusing to replace it implicitly')
    } else wrangler(['d1','execute',name,'--remote','--file',path.join(out,'deployment/seed.sql'),'--yes'])
  }
  console.log(wrangler(['deploy',...(mode==='dry-run'?['--dry-run']:[])]))
}
