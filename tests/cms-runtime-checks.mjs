// Authenticated CMS CRUD against real workerd/D1. Only disposable local data.
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {sortContent} from '../lib/content-model.ts'
import {runCmsBatch} from '../admin-lab/cms-bulk.ts'
export async function checkCmsManagement({call,cms,mf,origin,jar,csrf}) {
  const published=async(kind)=>JSON.parse((await cms.prepare('SELECT body FROM free_documents WHERE name=?').bind(kind).first()).body).items
  const notice=title=>({item:{id:'',kind:'notice',title,date:'2020-01-01',summary:'',author:'SMP',category:'공지',pinned:false,externalUrl:null,attachments:[]},blocks:[],cover:null})
  const a=await(await call('/api/cms/notice','POST',notice('CMS full flow A'))).json()
  const b=await(await call('/api/cms/notice','POST',notice('CMS full flow B'))).json()
  const image=new Uint8Array(await sharp({create:{width:40,height:60,channels:3,background:'#185077'}}).webp().toBuffer())
  const asset=await(await call(`/api/cms/entry/${a.id}/image`,'POST',image)).json()
  const edit={...a.draft,blocks:[{id:'f'.repeat(32),type:'image',image:{external:{url:asset.url}}},{id:'e'.repeat(32),type:'paragraph',paragraph:{rich_text:[{plain_text:'<script>untrusted text</script>'}]}}]}
  const denied=await mf.dispatchFetch(origin+`/api/cms/entry/${a.id}`,{method:'PUT',headers:{Origin:origin,Cookie:jar.read(),'Content-Type':'application/json','X-CSRF-Token':'incorrect'},body:JSON.stringify({revision:1,payload:edit})})
  assert.equal(denied.status,403)
  assert.equal((await cms.prepare('SELECT revision FROM cms_entries WHERE id=?').bind(a.id).first()).revision,1)
  await call(`/api/cms/entry/${a.id}`,'PUT',{revision:1,payload:edit})
  await call(`/api/cms/entry/${a.id}/approve`,'POST',{revision:2})
  await call(`/api/cms/entry/${b.id}/approve`,'POST',{revision:1})
  assert.deepEqual(sortContent(await published('notice')).filter(x=>[a.id,b.id].includes(x.id)).map(x=>x.id),[b.id,a.id])
  await call(`/api/cms/entry/${a.id}/move`,'POST',{revision:2,target:b.id,placement:'before'})
  assert.deepEqual(sortContent(await published('notice')).filter(x=>[a.id,b.id].includes(x.id)).map(x=>x.id),[a.id,b.id])
  const stale=await mf.dispatchFetch(origin+`/api/cms/entry/${a.id}`,{method:'PUT',headers:{Origin:origin,Cookie:jar.read(),'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({revision:2,payload:edit})})
  assert.equal(stale.status,409)
  let latest=await(await call(`/api/cms/entry/${a.id}`)).json()
  const revised={...latest.draft,item:{...latest.draft.item,title:'CMS edited A'}}
  await call(`/api/cms/entry/${a.id}`,'PUT',{revision:3,payload:revised})
  assert.equal((await published('notice')).find(x=>x.id===a.id).title,'CMS full flow A')
  await call(`/api/cms/entry/${a.id}/approve`,'POST',{revision:4})
  assert.equal((await published('notice')).find(x=>x.id===a.id).title,'CMS edited A')
  await call(`/api/cms/entry/${a.id}/trash`,'POST',{revision:4})
  assert.ok(!(await published('notice')).some(x=>x.id===a.id))
  await call(`/api/cms/entry/${a.id}/restore`,'POST',{revision:5})
  assert.ok(!(await published('notice')).some(x=>x.id===a.id))
  await call(`/api/cms/entry/${a.id}/approve`,'POST',{revision:6})
  assert.ok((await published('notice')).some(x=>x.id===a.id))
  const members=[]
  const roster={reviewed:true,batchId:crypto.randomUUID(),generation:41,group:'members',members:[{row:2,name:'가시험',department:'시험학과',year:'26',roles:['기장']},{row:3,name:'나시험',department:'시험학과',year:'25',roles:[]}]}
  const forbidden=await mf.dispatchFetch(origin+'/api/cms/member-import',{method:'POST',headers:{Origin:origin,Cookie:jar.read(),'Content-Type':'application/json','X-CSRF-Token':'incorrect'},body:JSON.stringify(roster)})
  assert.equal(forbidden.status,403)
  const imported=await(await call('/api/cms/member-import','POST',roster)).json()
  assert.equal(imported.created.length,2);assert.equal(imported.skipped.length,0)
  assert.equal((await cms.prepare("SELECT count(*) n FROM free_content WHERE kind='members'").first()).n,0)
  assert.equal((await(await call('/api/cms/member-import','POST',roster)).json()).created.length,0)
  assert.equal((await(await call('/api/cms/member-import?generation=41')).json()).items.length,2)
  for(const id of imported.created)await call(`/api/cms/entry/${id}/approve`,'POST',{revision:1})
  assert.equal((await published('members')).filter(m=>imported.created.includes(m.id)).length,2)
  for(const [name,roles] of [['가나다',[]],['하회장',['회장']],['나부회장',['부회장']],['다기장',['기장']]]){
    const m=await(await call('/api/cms/members','POST',{item:{id:'',name,generation:40,group:'members',department:'점검',year:'26',roles},blocks:[],cover:null})).json()
    await call(`/api/cms/entry/${m.id}/approve`,'POST',{revision:1});members.push(m)
  }
  assert.deepEqual((await(await call('/api/cms/members?group=40')).json()).items.map(e=>e.draft.item.name),['하회장','나부회장','다기장','가나다'])
  const cohorts=await(await call('/api/cms/member-cohorts')).json()
  assert.deepEqual(cohorts.items.map(c=>[c.generation,c.total,c.published]),[[41,2,2],[40,4,4]])
  const privateCohorts=await mf.dispatchFetch(origin+'/api/cms/member-cohorts')
  assert.equal(privateCohorts.status,401)
  const m=members[0],changed={...m.draft,item:{...m.draft.item,department:'수정 학과'}}
  await call(`/api/cms/entry/${m.id}`,'PUT',{revision:1,payload:changed});assert.equal((await published('members')).find(x=>x.id===m.id).department,'점검')
  const changedCohort=(await(await call('/api/cms/member-cohorts?state=draft&q=40')).json()).items
  assert.equal(changedCohort[0].drafts,1);assert.equal(changedCohort[0].total,4)
  await call(`/api/cms/entry/${m.id}/approve`,'POST',{revision:2});assert.equal((await published('members')).find(x=>x.id===m.id).department,'수정 학과')
  await call(`/api/cms/entry/${m.id}/trash`,'POST',{revision:2});assert.ok(!(await published('members')).some(x=>x.id===m.id))
  await call(`/api/cms/entry/${m.id}/restore`,'POST',{revision:3});assert.ok(!(await published('members')).some(x=>x.id===m.id))
  await call(`/api/cms/entry/${m.id}/approve`,'POST',{revision:4});assert.ok((await published('members')).some(x=>x.id===m.id))
  const search=(await cms.prepare("SELECT body FROM free_documents WHERE name='search'").first()).body
  assert.ok(search.includes('수정 학과'));assert.ok(search.includes('CMS edited A'))
  // The browser batch runner goes through the same real session/CSRF endpoints.
  // Exercise whole batches for both notices and members, including restoration
  // staying private and no mutation of an unrelated published row.
  for(const [kind,ids] of [['notice',[a.id,b.id]],['members',members.map(e=>e.id)]]) {
    for(const action of ['withdraw','approve','trash','restore','approve']) {
      const entries=await Promise.all(ids.map(async id=>(await call(`/api/cms/entry/${id}`)).json()))
      const result=await runCmsBatch(entries,action,async(e,name)=>(await call(`/api/cms/entry/${e.id}/${name}`,'POST',{revision:e.revision})).json(),()=>{})
      assert.equal(result.completed.length,ids.length);assert.deepEqual(result.failures,[])
      const visible=(await published(kind)).filter(e=>ids.includes(e.id))
      assert.equal(visible.length,action==='approve'?ids.length:0)
    }
  }
  console.log(JSON.stringify({cmsRuntime:'pass',checks:['session/CSRF','notice create/edit/approve','upload image','manual order','stale revision rejection','trash/restore stays private','member bulk import/private approval/replay','member CRUD and role ordering','public catalogue/search projection']}))
}
