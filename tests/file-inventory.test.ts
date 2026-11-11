import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {fileInventory,combineInventory} from '../admin-cloud/file-inventory'
import type {Database,Statement} from '../cloudflare/bindings'

test('storage inventory joins real public references, deduplicates shared PDFs, and separates retained originals',async()=>{
 const sql=new DatabaseSync(':memory:')
 for(const f of ['admin-cloud/schema.sql','cms/schema.sql','cloudflare/migrations/0002_free_runtime.sql'])sql.exec(readFileSync(f,'utf8'))
 const prepare=(q:string,v:unknown[]=[]):Statement=>({bind:(...args)=>prepare(q,args),async first<T>(){return(sql.prepare(q).get(...v as never[])??null)as T|null},async all<T>(){return{results:sql.prepare(q).all(...v as never[])as T[]}},async run(){return sql.prepare(q).run(...v as never[])}})
 const db:Database={prepare,async batch(s){return Promise.all(s.map(v=>v.run()))}}
 try{
  sql.prepare("INSERT INTO report_files(id,provider,identity,pdf_bytes,cover_bytes,created,state) VALUES('real','d1','hash',28000,100,1,'ready'),('old','drive','old',5000,100,1,'pending-delete')").run()
  const a='a'.repeat(32),b='b'.repeat(32),c='c'.repeat(32), drive='known_drive_id'
  for(const [id,item] of [[a,{title:'실제 인바디',managedPdf:{identity:'hash'}}],[b,{title:'리포트 B',externalUrl:`https://drive.google.com/file/d/${drive}/view`}],[c,{title:'같은 파일의 다른 게시글',externalUrl:`https://drive.google.com/file/d/${drive}/view`}]] as const){
   sql.prepare("INSERT INTO free_content(id,kind,revision,item,search_entry,cover) VALUES(?,'research','1',?,'{}',?)").run(id,JSON.stringify(item),JSON.stringify({reader:{source:{bytes:10000}}}))
   sql.prepare("INSERT INTO cms_entries(id,kind,draft,updated_at) VALUES(?,'research',?,'2026-11-11')").run(id,JSON.stringify({item,blocks:[{private:'DO_NOT_EXPOSE'}]}))
  }
  const result=await fileInventory(db,db)
  assert.equal(result.files.length,3);assert.equal(result.totalBytes,43000);assert.equal(result.publicFiles,2)
  assert.equal(result.files[0].name,'실제 인바디');assert.equal(result.files[0].state,'public')
  assert.equal(result.files.find(f=>f.driveId===drive)?.references.filter(r=>r.usage==='public').length,2)
  assert.equal(result.files.find(f=>f.id==='asset:old')?.state,'retained')
  assert.ok(!JSON.stringify(result).includes('DO_NOT_EXPOSE'))
 }finally{sql.close()}
})
test('unmatched files are not labelled as tests and unknown sizes are not zero',()=>{
 const result=combineInventory([],[{id:'a'.repeat(32),title:'원본',url:'https://drive.google.com/file/d/real_file_id/view',identity:null,upload:null,bytes:null,name:null,usage:'draft'},
 {id:'b'.repeat(32),title:'외부 주소',url:'https://evil.test/?id=real_file_id',identity:null,upload:null,bytes:500,name:null,usage:'public'}])
 assert.equal(result.files.length,1);assert.equal(result.files[0].bytes,null);assert.equal(result.unknown,1);assert.equal(result.files[0].state,'private')
})
