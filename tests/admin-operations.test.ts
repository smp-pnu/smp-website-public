import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {ensureAdminSchema,setAdminConfig} from '../free/jobs/admin-schema'
import {syncAdminStatus,statusProperties} from '../free/jobs/admin-status'
import {parseRecruitment,recruitmentState,defaultRecruitment} from '../lib/recruitment'
import type {Database,Statement} from '../cloudflare/bindings'
import type {NotionPage} from '../lib/content-model'
const id='a'.repeat(32),source='b'.repeat(32)
function database(){
 const sqlite=new DatabaseSync(':memory:')
 for(const name of ['0002_free_runtime','0003_free_guards','0009_job_failures'])sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),'utf8'))
 const prepare=(sql:string,values:unknown[]=[]):Statement=>({bind:(...args)=>prepare(sql,args),async first<T>(){return(sqlite.prepare(sql).get(...values as any[])??null) as T|null},async all<T>(){return{results:sqlite.prepare(sql).all(...values as any[]) as T[]}},async run(){return sqlite.prepare(sql).run(...values as any[])}})
 const db:Database={prepare,async batch(s){const out=[];for(const q of s)out.push(await q.run());return out}}
 return {sqlite,db}
}
test('operations write only changed rows in a separate database and recover after withdrawal',async()=>{
 const {db,sqlite}=database();const requests:{path:string;body:any}[]=[]
 try{
  await ensureAdminSchema(db);await setAdminConfig(db,'operations_source',source)
  sqlite.prepare('INSERT INTO free_content(id,kind,revision,item,search_entry,body_revision) VALUES(?,?,?,?,?,?)').run(id,'research','2026-01-01T00:00:00Z',JSON.stringify({title:'리포트'}),'{}','2026-01-01T00:00:00Z')
  const env={CMS_DB:db,ASSETS:{fetch},NOTION_TOKEN:'fixture',NOTION_WORKLOAD:'publisher' as const,NOTION_FETCH:async(input:any,init:any)=>{const path=String(input);requests.push({path,body:JSON.parse(init.body)});return Response.json(path.endsWith('/query')?{results:[]}:{id:'c'.repeat(32)})}}
  assert.equal(await syncAdminStatus(env),1)
  assert.equal(requests[1].body.parent.data_source_id,source)
  assert.equal(requests[1].body.properties.상태.select.name,'게시 완료')
  assert.equal(await syncAdminStatus(env),0);assert.equal(requests.length,2)
  sqlite.exec('DELETE FROM free_content')
  assert.equal(await syncAdminStatus(env),1);assert.equal(requests.at(-1)!.body.properties.상태.select.name,'게시 제외')
  assert.equal(await syncAdminStatus(env),0)
  assert.ok(requests.every(r=>!r.path.endsWith('/pages/'+id)))
 }finally{sqlite.close()}
})
test('status never claims completion for a different content revision or exposes raw errors',()=>{
 const p=statusProperties({id,kind:'notice',title:'공지',revision:'2026-02-01',body_revision:'2026-01-01',attempts:1,last_error:null})
 assert.equal(p.상태.select.name,'준비 중')
 const q=statusProperties({id,kind:'notice',title:'공지',revision:'2026-02-01',body_revision:null,attempts:5,last_error:'secret-credential'})
 assert.equal(q.상태.select.name,'확인 필요');assert.doesNotMatch(JSON.stringify(q),/secret-credential/)
})
test('recruitment opens only for confirmed dates and closes after the end',()=>{
 const c={...defaultRecruitment,status:'open' as const,scheduleConfirmed:true,start:'2027-01-01T00:00:00Z',end:'2027-01-31T00:00:00Z',applicationUrl:'https://forms.gle/test'}
 assert.equal(recruitmentState(c,Date.parse('2026-12-31')),'upcoming')
 assert.equal(recruitmentState(c,Date.parse('2027-01-02')),'open')
 assert.equal(recruitmentState(c,Date.parse('2027-02-01')),'closed')
 assert.equal(recruitmentState({...c,applicationUrl:null},Date.parse('2027-01-02')),'upcoming')
 const props:any={기수:{number:41},'모집 상태':{select:{name:'모집 중'}},'일정 확정':{checkbox:false}}
 assert.throws(()=>parseRecruitment({properties:props} as NotionPage))
 assert.throws(()=>parseRecruitment({in_trash:true,properties:props} as NotionPage))
})

test('company archive matches exact company and orders newest first, while search tolerates spacing',async()=>{
 const {createContentSearchIndex,findContentMatches,selectContentPage}=await import('../lib/content-query')
 const base:any={kind:'research',summary:'',author:'',category:'기업',attachments:[],industry:'',semester:'2026-1'}
 const items=[{...base,id:'1',company:'삼성전자',title:'첫 보고서',ticker:'005930',date:'2025-01-01'},{...base,id:'2',company:'삼성전자',title:'최근 보고서',date:'2026-01-01'},{...base,id:'3',company:'삼성전자로지텍',title:'관계사',date:'2026-02-01'}]
 const selected=selectContentPage(items,'research',{company:'삼성전자'})
 assert.deepEqual(selected.visibleItems.map(i=>i.id),['2','1'])
 assert.equal(selected.listSearch.company,'삼성전자')
 assert.equal(findContentMatches(createContentSearchIndex(items),'삼성 전자').length,3)
 assert.equal(findContentMatches(createContentSearchIndex(items),'００５９３０').length,1)
})
