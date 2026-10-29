import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import type {Database,Statement} from '../cloudflare/bindings'
import {purgeCmsEntry,trashPreview,emptyTrashItem} from '../cms/trash'
import type {Env} from '../admin-cloud/worker'
const id='a'.repeat(32),other='b'.repeat(32),asset='c'.repeat(32)
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of ['admin-cloud/schema.sql','cms/schema.sql','cms/budget.sql'])sql.exec(readFileSync(file,'utf8'))
 sql.exec('CREATE TABLE free_content(id TEXT PRIMARY KEY,item TEXT,blocks TEXT)')
 const prepare=(q:string,v:unknown[]=[]):Statement=>({bind:(...x)=>prepare(q,x),async first<T>(){return (sql.prepare(q).get(...v as never[])??null) as T|null},async all<T>(){return {results:sql.prepare(q).all(...v as never[]) as T[]}},async run(){return sql.prepare(q).run(...v as never[])}})
 const db:Database={prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}}
 sql.prepare("INSERT INTO cms_entries(id,kind,draft,updated_at,trashed_at) VALUES(?,'notice',?,'2026-10-29','2026-10-29')").run(id,JSON.stringify({item:{title:'Discarded example'},blocks:[]}))
 sql.prepare("INSERT INTO cms_history VALUES(?,1,'{}','2026-10-29')").run(id)
 sql.prepare("INSERT INTO cms_assets VALUES(?,?,'test.webp','image/webp',12,'data','2026-10-29')").run(asset,id)
 return {sql,db,env:{CMS_DB:db,ADMIN_DB:db} as Env}
}
test('trash deletion is revision-guarded and preserves restored or still-public records',async()=>{
 const {sql,db}=fixture();try{
 for(const change of ["revision=2","trashed_at=NULL","approved='{}',approved_revision=1"]){
  sql.exec(`UPDATE cms_entries SET ${change}`)
  await assert.rejects(()=>purgeCmsEntry(db,id,1))
  assert.equal(sql.prepare('SELECT count(*) n FROM cms_history').get()?.n,1);assert.equal(sql.prepare('SELECT count(*) n FROM cms_assets').get()?.n,1)
  sql.exec("UPDATE cms_entries SET revision=1,trashed_at='2026-10-29',approved=NULL,approved_revision=NULL")
 }
 sql.prepare("INSERT INTO free_content VALUES(?,'{}','[]')").run(id)
 await assert.rejects(()=>purgeCmsEntry(db,id,1));assert.equal(sql.prepare('SELECT count(*) n FROM cms_entries').get()?.n,1)
 }finally{sql.close()}
})
test('trash preview exposes only deleted summaries; purge removes metadata and unshared attachments',async()=>{
 const {sql,db,env}=fixture();try{
 const preview=await trashPreview(db);assert.equal(preview.total,1);assert.equal(preview.items[0].title,'Discarded example');assert.ok(!JSON.stringify(preview).includes('blocks'))
 await assert.rejects(()=>emptyTrashItem(env,{id,revision:1},Date.now()))
 const result=await emptyTrashItem(env,{id,revision:1,confirm:'permanent-delete'},Date.now());assert.equal(result.removed,true)
 for(const table of ['cms_entries','cms_history','cms_assets','mutation_checks'])assert.equal(sql.prepare(`SELECT count(*) n FROM ${table}`).get()?.n,0)
 assert.equal((await emptyTrashItem(env,{id,revision:1,confirm:'permanent-delete'},Date.now())).alreadyRemoved,true)
 }finally{sql.close()}
})
test('attachments reused by another published document or its history survive trash deletion',async()=>{
 for(const mode of ['draft','history','public']){
 const {sql,db}=fixture();try{
  sql.prepare("INSERT INTO cms_entries(id,kind,draft,updated_at) VALUES(?,'notice',?,'2026-10-29')").run(other,JSON.stringify({item:{title:'Real notice'},blocks:mode==='draft'?[asset]:[]}))
  if(mode==='history')sql.prepare("INSERT INTO cms_history VALUES(?,1,?,'2026-10-29')").run(other,JSON.stringify({asset}))
  if(mode==='public')sql.prepare("INSERT INTO free_content VALUES(?,'{}',?)").run(other,JSON.stringify([asset]))
  await purgeCmsEntry(db,id,1)
  assert.equal(sql.prepare('SELECT count(*) n FROM cms_assets').get()?.n,1)
  assert.ok(sql.prepare('SELECT id FROM cms_entries WHERE id=?').get(other))
 }finally{sql.close()}}
})
test('purging a report quarantines an unshared upload without deleting bytes; shared history keeps it active',async()=>{
 for(const shared of [false,true]){
 const {sql,env}=fixture(),upload='d'.repeat(32),now=Date.parse('2026-10-29T00:00:00Z');try{
  sql.prepare('UPDATE cms_entries SET draft=? WHERE id=?').run(JSON.stringify({item:{title:'Discarded report'},upload:{id:upload}}),id)
  sql.prepare("INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,data) VALUES(?,'hash','ready','admin',32,12,?)").run(upload,JSON.stringify({revision:1,filename:'source.pdf'}))
  sql.prepare("INSERT INTO chunks VALUES(?,'pdf',0,32,'hash','original-bytes')").run(upload)
  if(shared)sql.prepare("INSERT INTO cms_history VALUES(?,1,?,'2026-10-29')").run(other,JSON.stringify({upload:{id:upload}}))
  const result=await emptyTrashItem(env,{id,revision:1,confirm:'permanent-delete'},now)
  assert.equal(result.cleanupPending,false)
  const row=sql.prepare('SELECT revision,data FROM objects WHERE id=?').get(upload)!
  assert.equal(row.revision,shared?1:2)
  assert.equal(Boolean(JSON.parse(String(row.data)).trashedAt),!shared)
  assert.equal(sql.prepare('SELECT data FROM chunks WHERE object_id=?').get(upload)?.data,'original-bytes')
 }finally{sql.close()}}
})
