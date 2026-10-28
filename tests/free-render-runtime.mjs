// Native workerd + isolated D1: no production credentials or network services.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,readdir} from 'node:fs/promises'
import {build} from 'esbuild'
import {ensureRenderVersions} from '../free/jobs/render-schema.ts'
const require=createRequire(import.meta.url)
const {Miniflare,convertV4MiniflareOptions}=createRequire(require.resolve('wrangler/package.json'))('miniflare')
const bundle=await build({entryPoints:['free/server/worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',conditions:['react-server'],mainFields:['module','main'],external:['node:*'],target:'es2022',define:{__SMP_FIXTURE__:'false'}})
const shell='<!doctype html><html><head><!--smp-head--><title>Shell</title><!--/smp-head--></head><body><div id="seo-content"></div></body></html>'
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],cf:false,host:'127.0.0.1',port:0,d1Databases:{CMS_DB:'render-test'},serviceBindings:{ASSETS:async()=>new Response(shell,{headers:{'content-type':'text/html'}})}}))
try {
  const db=await mf.getD1Database('CMS_DB')
  for(const name of (await readdir('cloudflare/migrations')).sort()) {
    const source=await readFile('cloudflare/migrations/'+name,'utf8')
    const statements=source.includes('-- statement')?source.split('-- statement').slice(1):source.split(';')
    await db.batch(statements.filter(s=>s.trim()).map(s=>db.prepare(s)))
  }
  const sql=(s,...p)=>db.prepare(s).bind(...p).run()
  await sql("INSERT INTO free_controls(name,until_at) VALUES('cms-source-admin',1)")
  const id='a'.repeat(32), notice='b'.repeat(32)
  const item={id,kind:'research',title:'원본 리포트',company:'테스트기업',date:'2026-10-01',editedAt:'2026-10-01',summary:'요약',category:'기업분석',author:'R1',pinned:false,externalUrl:null,attachments:[]}
  const block=text=>JSON.stringify([{id:'c'.repeat(32),type:'paragraph',paragraph:{rich_text:[{plain_text:text}]}}])
  for(const entry of [item,{...item,id:notice,kind:'notice',title:'공지 원본'}]) {
    await sql('INSERT INTO free_content(id,kind,revision,item,search_entry,blocks,body_revision) VALUES(?,?,?,?,?,?,?)',entry.id,entry.kind,entry.editedAt,JSON.stringify(entry),'{}',block('본문 원본'),entry.editedAt)
    await sql('INSERT INTO free_documents(name,body) VALUES(?,?)',entry.kind,JSON.stringify({items:[entry]}))
  }
  const request=(path,options={})=>mf.dispatchFetch('https://pnusmp.com'+path,options)
  const paths=['/research','/research?page=1',`/research/${id}`,`/notice/${notice}`,`/api/detail/research/${id}`]
  for(const path of paths) {
    const first=await request(path),text=await first.text()
    assert.equal(first.status,200,path);assert.match(first.headers.get('server-timing'),/miss/)
    const hit=await request(path)
    assert.match(hit.headers.get('server-timing'),/hit/,path);assert.equal(await hit.text(),text)
    assert.match(hit.headers.get('cache-control'),/no-store/);assert.equal(hit.headers.get('x-content-type-options'),'nosniff')
  }
  assert.equal((await request('/research',{method:'POST'})).status,405)
  assert.equal((await request('/research',{headers:{'sec-fetch-site':'cross-site','sec-fetch-mode':'cors'}})).status,403)
  const head=await request(`/research/${id}`,{method:'HEAD'});assert.equal(await head.text(),'');assert.match(head.headers.get('server-timing'),/hit/)
  assert.equal((await request('/research?page=999')).status,404)
  // Body changes do not need a new catalogue revision to invalidate a detail.
  await sql('UPDATE free_content SET blocks=? WHERE id=?',block('새 본문'),id)
  const body=await request(`/research/${id}`);assert.match(body.headers.get('server-timing'),/miss/);assert.match(await body.text(),/새 본문/)
  const version=()=>db.prepare("SELECT version FROM free_render_versions WHERE kind='research'").first('version')
  const before=await version()
  await sql('UPDATE free_content SET item=item,cover=cover WHERE id=?',id)
  assert.equal(await version(),before)
  // A prepared cover/reader update and a separately rebuilt list each expire.
  await sql('UPDATE free_content SET cover=? WHERE id=?',JSON.stringify({sourceKey:'test',url:`/report-covers/${id}/${'d'.repeat(64)}.webp`}),id)
  assert.match((await request(`/research/${id}`)).headers.get('server-timing'),/miss/)
  await sql("UPDATE free_documents SET version=version+1,body=? WHERE name='research'",JSON.stringify({items:[{...item,title:'목록 수정'}]}))
  assert.match(await(await request('/research')).text(),/목록 수정/)
  // Delete/withdraw invalidates all old details immediately, independent of TTL.
  await sql('DELETE FROM free_content WHERE id=?',id)
  assert.ok(await version()>before)
  for(const path of [`/research/${id}`,`/api/detail/research/${id}`]) assert.equal((await request(path)).status,404)
  await sql("UPDATE free_documents SET version=version+1,body=? WHERE name='research'",JSON.stringify({items:[]}))
  assert.doesNotMatch(await(await request('/research')).text(),/목록 수정|원본 리포트/)
  assert.match((await request(`/notice/${notice}`)).headers.get('server-timing'),/hit/)
  // Every request still spends the existing daily budget, even on a warm hit.
  const key=`public-api-day:${Math.floor(Date.now()/86400000)}`
  await sql('UPDATE free_budget SET count=24000 WHERE key=?',key)
  assert.equal((await request(`/notice/${notice}`)).status,429)
  // Publisher migration is idempotent and repairs a partial install atomically.
  await sql('DROP TRIGGER free_render_update');await ensureRenderVersions(db)
  assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name='free_render_update'").first())
  const retained=await version();await ensureRenderVersions(db);assert.equal(await version(),retained)
  console.log('PASS: workerd cache hits, byte-identical HTML/JSON, body/cover/catalogue invalidation, method/origin/HEAD/budget guards and idempotent schema')
} finally {await mf.dispose()}
