import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import type {Database,Statement} from '../cloudflare/bindings'
import type {Env} from '../admin-cloud/worker'
import {guardUploadDeletion,cmsMaintenance} from '../cms/maintenance'
import {resolvePdfSource,uploadReferenced,queueRetirement} from '../cms/pdf-sources'
import {ReportVersions} from '../admin-cloud/report-versions'
import {fileInventory} from '../admin-cloud/file-inventory'
import type {Payload} from '../cms/model'
const id='a'.repeat(32),upload='d'.repeat(32),identity='f'.repeat(64),old='old_drive_source_123',now=Date.parse('2026-11-11T00:00:00Z')
function fixture(){
 const sql=new DatabaseSync(':memory:')
 for(const f of ['admin-cloud/schema.sql','cms/schema.sql','cms/budget.sql','cloudflare/migrations/0002_free_runtime.sql'])sql.exec(readFileSync(f,'utf8'))
 sql.exec('CREATE TABLE free_controls(name TEXT PRIMARY KEY,until_at INTEGER NOT NULL)')
 const prepare=(q:string,v:unknown[]=[]):Statement=>({bind:(...args)=>prepare(q,args),async first<T>(){return(sql.prepare(q).get(...v as never[])??null) as T|null},async all<T>(){return{results:sql.prepare(q).all(...v as never[])as T[]}},async run(){return sql.prepare(q).run(...v as never[])}})
 const db:Database={prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}}
 return{sql,db,env:{CMS_DB:db,ADMIN_DB:db}as Env}
}
test('deletion is blocked when only the live approval, history, preparation job or PDF alias refers to an upload',async()=>{
 for(const mode of ['approved','history','job','alias']){
  const{sql,db,env}=fixture();try{
   const payload=JSON.stringify({item:{title:'Original'},upload:{id:upload}})
   if(mode==='approved')sql.prepare("INSERT INTO cms_entries(id,kind,draft,approved,updated_at)VALUES(?,'research','{}',?,'today')").run(id,payload)
   if(mode==='history')sql.prepare("INSERT INTO cms_history VALUES(?,1,?,'today')").run(id,payload)
   if(mode==='job')sql.prepare('INSERT INTO cms_jobs(id,revision,payload,next_at)VALUES(?,1,?,0)').run(id,payload)
   if(mode==='alias'){
    sql.prepare("INSERT INTO cms_pdf_aliases VALUES(?,?,?,?,?,'{}','today')").run(old,upload,identity,identity,100)
    assert.equal(await uploadReferenced(db,upload),false,'Unused alias alone must not retain a deleted original forever')
    sql.prepare("INSERT INTO cms_history VALUES(?,1,?,'today')").run(id,JSON.stringify({item:{externalUrl:`https://drive.google.com/file/d/${old}/view`}}))
   }
   assert.equal(await uploadReferenced(db,upload),true)
   await assert.rejects(()=>guardUploadDeletion(env,[upload]),/수정 이력/)
   await guardUploadDeletion(env,['b'.repeat(32)])
  }finally{sql.close()}
 }
})
test('byte-identical PDF alias preserves immutable history and resolves to one canonical inventory file',async()=>{
 const{sql,db}=fixture();try{
  const payload={item:{id,kind:'research',title:'Historical title',date:'2020-01-01',externalUrl:`https://drive.google.com/file/d/${old}/view`},blocks:[],cover:null}as unknown as Payload
  const original=JSON.stringify(payload),source={managedPdf:{name:'original.pdf',identity},upload:{id:upload,revision:5,report:{identity,bytes:100}},original:{url:'/immutable.pdf'}}
  sql.prepare("INSERT INTO cms_entries(id,kind,draft,updated_at)VALUES(?,'research',?,'today')").run(id,JSON.stringify({...payload,item:{...payload.item,externalUrl:null,managedPdf:source.managedPdf},upload:source.upload}))
  sql.prepare("INSERT INTO cms_history VALUES(?,1,?,'2020-01-01')").run(id,original)
  sql.prepare("INSERT INTO cms_pdf_aliases VALUES(?,?,?,?,?,?,'today')").run(old,upload,identity,identity,100,JSON.stringify(source))
  sql.prepare("INSERT INTO report_files(id,provider,identity,pdf_bytes,cover_bytes,file_id,created)VALUES('canonical','drive',?,100,12,'canonical_drive_id',1)").run(identity)
  const resolved=await resolvePdfSource(db,payload)
  assert.equal((resolved.item as {title:string}).title,'Historical title');assert.equal((resolved.item as {date:string}).date,'2020-01-01')
  assert.equal(resolved.upload?.id,upload);assert.equal((resolved.item as {externalUrl:null}).externalUrl,null)
  assert.equal(sql.prepare('SELECT payload FROM cms_history').get()?.payload,original)
  assert.throws(()=>sql.exec("UPDATE cms_history SET payload='{}'"),/IMMUTABLE/)
  const inventory=await fileInventory(db,db)
  assert.equal(inventory.files.length,1);assert.equal(inventory.totalBytes,100)
  assert.equal(inventory.files[0].references.some(r=>r.usage==='history'),true)
 }finally{sql.close()}
})
test('only displaced uploads enter cleanup; history delays retirement and quarantine protects recently replaced bytes',async()=>{
 const{sql,db,env}=fixture();try{
  for(const u of [upload,'e'.repeat(32)])sql.prepare("INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,data)VALUES(?,?,'ready','admin',100,12,?)").run(u,u,JSON.stringify({id:u,revision:1,filename:'original.pdf'}))
  sql.prepare("INSERT INTO chunks VALUES(?,'pdf',0,100,'proof','bytes')").run(upload)
  sql.prepare("INSERT INTO cms_history VALUES(?,1,?,'today')").run(id,JSON.stringify({upload:{id:upload}}))
  await queueRetirement(db,upload,now).run();await cmsMaintenance(env,now)
  assert.ok(!JSON.parse(String(sql.prepare('SELECT data FROM objects WHERE id=?').get(upload)?.data)).trashedAt)
  sql.prepare('DELETE FROM cms_history WHERE id=?').run(id)
  await cmsMaintenance(env,now+86400001)
  assert.ok(JSON.parse(String(sql.prepare('SELECT data FROM objects WHERE id=?').get(upload)?.data)).trashedAt)
  assert.ok(!JSON.parse(String(sql.prepare('SELECT data FROM objects WHERE id=?').get('e'.repeat(32))?.data)).trashedAt)
  assert.equal(sql.prepare('SELECT data FROM chunks WHERE object_id=?').get(upload)?.data,'bytes')
  assert.equal(sql.prepare('SELECT count(*) n FROM cms_upload_retirements').get()?.n,0)
  // A revived CMS reference blocks the final purge even after quarantine.
  sql.prepare("INSERT INTO cms_history VALUES(?,2,?,'today')").run(id,JSON.stringify({upload:{id:upload}}))
  await new ReportVersions(db,now+32*86400000).expireTrash(2,async u=>!await uploadReferenced(db,u))
  assert.ok(sql.prepare('SELECT id FROM objects WHERE id=?').get(upload))
 }finally{sql.close()}
})
test('publication ID is not a file reference, but a live PDF identity protects its actual source',async()=>{
 const{sql,db}=fixture();try{
  sql.prepare("INSERT INTO cms_entries(id,kind,draft,updated_at)VALUES(?,'research',?,'today')").run(upload,JSON.stringify({item:{id:upload,title:'Unchanged URL'},upload:{id:'b'.repeat(32)}}))
  assert.equal(await uploadReferenced(db,upload,db),false)
  sql.prepare("INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,data)VALUES(?,?,'ready','admin',100,12,'{}')").run(upload,identity)
  sql.prepare("INSERT INTO report_files(id,provider,identity,pdf_bytes,cover_bytes,created)VALUES('source','drive',?,100,12,1)").run(identity)
  sql.prepare("INSERT INTO report_versions(report_id,revision,asset_id,data,created)VALUES(?,1,'source','{}',1)").run(upload)
  sql.prepare("INSERT INTO free_content(id,kind,revision,item,search_entry)VALUES(?,'research','1',?,'{}')").run(id,JSON.stringify({id,managedPdf:{identity}}))
  assert.equal(await uploadReferenced(db,upload,db),true)
 }finally{sql.close()}
})
