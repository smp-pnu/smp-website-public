import assert from 'node:assert/strict'
import {CmsStore} from '../cms/store.ts'
import {CloudStore} from '../admin-cloud/store.ts'
import {uploadReferenced} from '../cms/pdf-sources.ts'
import {chunkBytes,fileIdentity,sha256} from '../admin-cloud/protocol.ts'
import {samplePdf} from '../admin-lab/sample.ts'

// All Drive requests run through native workerd against MockDrive. No school
// credentials, production records, real Google calls or test uploads are used.
export async function checkDriveReplacement({db,cms,call,data,google,draft,cover,fields,exported,approved,pdf}) {
 const id=approved.id,store=new CmsStore(cms),before=await store.get(id)
 const oldPayload={...before.draft,cover:{test:'old'},original:{url:'/old.pdf'}}
 await store.complete(id,before.revision,oldPayload)
 const oldPublic=await cms.prepare('SELECT item FROM free_content WHERE id=?').bind(id).first()
 const oldFile=await db.prepare('SELECT f.* FROM report_files f JOIN report_file_bindings b ON b.asset_id=f.id WHERE b.report_id=?').bind(draft.id).first()
 const bytes=new Uint8Array(await samplePdf(1).arrayBuffer())
 const create={filename:'replacement.pdf',fileBytes:bytes.length,hash:await fileIdentity(bytes),rawSha256:await sha256(bytes),coverBytes:cover.length,pages:3,fields,evidence:[],warnings:[]}
 const upload=await data('/api/uploads','POST',create)
 await assert.rejects(()=>call(`/api/uploads/${upload.id}/finish`,'POST'),/40[09]/)
 assert.deepEqual(new Uint8Array(await(await exported(`/api/publisher/reports/${approved.id}/${approved.revision}/pdf/0`)).arrayBuffer()),pdf.slice(0,chunkBytes),'Incomplete replacement cannot disturb the old approval')
 assert.equal(google.files.get(oldFile.file_id).trashed,false)
 for(const[kind,body]of[['pdf',bytes],['cover',cover]])for(let offset=0;offset<body.length;offset+=chunkBytes)
  await call(`/api/uploads/${upload.id}/${kind}/${offset/chunkBytes}`,'PUT',body.slice(offset,offset+chunkBytes))
 const saved=await data(`/api/uploads/${upload.id}/finish`,'POST')
 assert.equal((await data(`/api/uploads/${upload.id}/finish`,'POST')).id,saved.id,'Finish retry cannot duplicate an original')
 const newFile=await db.prepare('SELECT f.* FROM report_files f JOIN report_file_bindings b ON b.asset_id=f.id WHERE b.report_id=?').bind(saved.id).first()
 assert.notEqual(newFile.file_id,oldFile.file_id)
 assert.deepEqual(google.files.get(newFile.file_id).data,bytes)
 await data(`/api/drafts/${saved.id}`,'PATCH',{revision:saved.revision,command:{type:'approve',reviewed:true}})
 const replaced=await data('/api/cms/import-upload','POST',{id:saved.id,target:id})
 assert.equal(replaced.id,id);assert.equal(replaced.draft.item.title,before.draft.item.title)
 assert.equal(replaced.draft.cover,null);assert.equal(replaced.draft.original,undefined)
 assert.equal((await cms.prepare('SELECT item FROM free_content WHERE id=?').bind(id).first()).item,oldPublic.item,'Draft replacement must not change public bytes/identity')
 assert.equal((await cms.prepare('SELECT count(*) n FROM cms_upload_retirements WHERE upload_id=?').bind(approved.id).first()).n,1)
 await assert.rejects(()=>call(`/api/drafts/${draft.id}`,'PATCH',{revision:approved.revision,command:{type:'trash'}}),/409/,'Old live approval still protects source')
 const queued=await data(`/api/cms/entry/${id}/approve`,'POST',{revision:replaced.revision})
 assert.equal(queued.pending,true)
 assert.equal((await cms.prepare('SELECT item FROM free_content WHERE id=?').bind(id).first()).item,oldPublic.item,'Public remains unchanged until prepared assets commit')
 const grant=await cms.prepare('SELECT source_id FROM cms_export_grants WHERE id=?').bind(id).first()
 assert.equal(grant.source_id,saved.id.replaceAll('-',''))
 const newPayload={...replaced.draft,cover:{test:'new'},original:{url:'/new.pdf'}}
 await store.complete(id,replaced.revision,newPayload)
 assert.equal(JSON.parse((await cms.prepare('SELECT item FROM free_content WHERE id=?').bind(id).first()).item).managedPdf.identity,create.hash)
 await call('/api/storage/maintenance','POST')
 assert.equal(google.files.get(oldFile.file_id).trashed,false,'Retained publication history must keep original bytes')
 // Advance the five-revision CMS window through normal completed edits.
 for(let n=0;n<6;n++){
  const current=await store.get(id),updated=await store.save(id,current.revision,{...current.draft,item:{...current.draft.item,summary:`Revision ${n}`}})
  await store.complete(id,updated.revision,updated.draft)
 }
 assert.equal(await uploadReferenced(cms,approved.id),false)
 await cms.prepare("DELETE FROM free_controls WHERE name='cms-housekeeping'").run()
 await cms.prepare('UPDATE cms_upload_retirements SET next_at=0').run()
 await call('/api/storage/maintenance','POST')
 const retired=await db.prepare('SELECT data FROM objects WHERE id=?').bind(draft.id).first()
 assert.ok(JSON.parse(retired.data).trashedAt)
 assert.equal(google.files.get(oldFile.file_id).trashed,false,'Thirty-day quarantine does not delete at replacement time')
 await db.prepare("DELETE FROM usage WHERE key='housekeeping'").run()
 await new CloudStore(db,Date.now()+31*86400000,async u=>!await uploadReferenced(cms,u)).cleanup()
 await db.prepare('UPDATE report_files SET delete_after=0 WHERE id=?').bind(oldFile.id).run()
 const runCleanup=async()=>{await db.prepare("DELETE FROM usage WHERE key='drive-maintenance'").run();return data('/api/storage/maintenance','POST')}
 google.trashFailures=true
 assert.equal((await runCleanup()).failed,1)
 assert.equal(google.files.get(oldFile.file_id).trashed,false)
 assert.equal((await db.prepare('SELECT state FROM report_files WHERE id=?').bind(oldFile.id).first()).state,'pending-delete')
 google.trashFailures=false
 await db.prepare('UPDATE report_files SET delete_after=0 WHERE id=?').bind(oldFile.id).run()
 assert.equal((await runCleanup()).removed,1)
 assert.equal(google.files.get(oldFile.file_id).trashed,true)
 assert.equal((await db.prepare('SELECT state FROM report_files WHERE id=?').bind(oldFile.id).first()).state,'deleted')
 assert.equal((await db.prepare('SELECT count(*) n FROM archived_report_chunks WHERE asset_id=?').bind(oldFile.id).first()).n,0)
 assert.equal(google.files.get(newFile.file_id).trashed,false)
 assert.deepEqual(new Uint8Array(await(await call(`/api/drafts/${saved.id}/pdf/0`)).arrayBuffer()),bytes.slice(0,chunkBytes))
 assert.ok(google.calls.every(c=>c.method!=='DELETE'),'Cleanup uses recoverable Trash, never permanent Drive deletion')
 console.log('PASS: native Drive replacement failure/retry, old-public preservation, new approval/source switch, immutable history retention, automatic orphan quarantine, failed Trash retry and new-PDF integrity')
}
