import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {runInNewContext} from 'node:vm'
const code=readFileSync(new URL('../scripts/drive-cleanup/Backup.gs',import.meta.url),'utf8')
test('backup keeps a verified previous checkpoint and rejects tampering',()=>{
 const props:Record<string,string>={},files=new Map<string,any>();let count=0
 const folder={createFile(name:string,raw:string){const id=String(++count);const f={getId:()=>id,getBlob:()=>({getDataAsString:()=>raw}),setTrashed:(b:boolean)=>{f.trashed=b},trashed:false};files.set(id,f);return f}}
 const c:any={PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>props[k],setProperty:(k:string,v:string)=>props[k]=v,setProperties:(v:object)=>Object.assign(props,v)})},DriveApp:{getFileById:(id:string)=>files.get(id)},MimeType:{PLAIN_TEXT:'text/plain'},smpDigest_:(s:string)=>createHash('sha256').update(s).digest('hex')}
 runInNewContext(code,c)
 const a={version:1,queue:[],items:{}};c.smpSaveBackup_(folder,a);const first=props.BACKUP_STATE_ID
 c.smpSaveBackup_(folder,a);assert.equal(count,1)
 c.smpSaveBackup_(folder,{...a,week:'2'});assert.equal(props.BACKUP_PREVIOUS_STATE_ID,first);assert.equal(files.get(first).trashed,false)
 assert.equal(c.smpBackupState_(folder).week,'2')
 props.BACKUP_STATE_HASH='wrong';assert.throws(()=>c.smpBackupState_(folder),/invalid/)
})
test('backup cannot exceed its byte limit or use a shared destination',()=>{
 const c:any={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'folder'})},DriveApp:{Access:{PRIVATE:'private'},getStorageLimit:()=>1000,getStorageUsed:()=>800,getFolderById:()=>({isTrashed:()=>false,getSharingAccess:()=> 'anyone',getEditors:()=>[],getViewers:()=>[]})}}
 runInNewContext(code,c)
 assert.throws(()=>c.smpBackupSpace_({bytes:0},51),/safety limit/)
 assert.throws(()=>c.smpBackupSpace_({bytes:2*1024*1024*1024},1),/safety limit/)
 assert.throws(()=>c.smpBackupFolder_(),/private/)
})
test('unchanged PDF copies are reused and external files are outside backup scope',()=>{
 const assets:any={},stats={bytes:0},state={assets,bytes:0};let copies=0
 const original={isTrashed:()=>false,getLastUpdated:()=>new Date(0),getSize:()=>100,getName:()=> 'report.pdf',makeCopy:()=>{copies++;return {getSharingAccess:()=> 'private',getId:()=> 'copy'}}}
 const c:any={DriveApp:{Access:{PRIVATE:'private'},getFileById:()=>original,getStorageLimit:()=>100000,getStorageUsed:()=>0},smpRefs_:()=>new Set(['source']),smpInside_:()=>true}
 runInNewContext(code,c)
 const cfg={deadline:Date.now()+60000,root:'root'}
 c.smpBackupAssets_({},state,{properties:{},last_edited_time:'date'},[],cfg,stats)
 c.smpBackupAssets_({},state,{properties:{},last_edited_time:'date'},[],cfg,stats)
 assert.equal(copies,1);assert.equal(stats.bytes,100)
 c.smpInside_=()=>false;c.smpBackupAssets_({},state,{properties:{}},[],cfg,stats);assert.equal(copies,1)
})
