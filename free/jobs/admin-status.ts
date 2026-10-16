import { createHash } from "node:crypto"
import { normalizeId } from "../../lib/content-model"
import { notion } from "../server/notion"
import { spend } from "../server/budget"
import type { Env } from "../server/types"
import { adminConfig } from "./admin-schema"

type Row = { id:string; kind:string; title:string; revision:string; body_revision:string|null; attempts:number|null; last_error:string|null }
const advice:Record<string,string> = {
  upstream_busy:"외부 서비스가 혼잡하거나 일 한도에 도달했습니다. 자동 재시도를 기다려주세요.",
  source_unavailable:"노션 원문과 PDF 파일의 공유 권한을 확인해주세요.",
  asset_preparation:"PDF·사진 형식과 크기를 확인해주세요. 수정 후 중단 건 재시도를 실행하세요.",
  publication_failed:"게시 작업이 완료되지 않았습니다. GitHub Actions의 운영 상태를 확인해주세요.",
}
const rich=(value:string)=>[{type:"text",text:{content:value.slice(0,1900)}}]
export function statusProperties(row:Row) {
  const state=row.last_error?"확인 필요":row.body_revision===row.revision?"게시 완료":"준비 중"
  return {
    제목:{title:rich(row.title)}, 상태:{select:{name:state}}, 종류:{select:{name:row.kind==="research"?"리포트":"공지"}},
    원문:{url:`https://www.notion.so/${row.id}`}, 홈페이지:{url:`https://pnusmp.com/${row.kind}/${row.id}`},
    "원문 수정 시각":{date:{start:row.revision}},
    안내:{rich_text:rich(row.last_error?advice[row.last_error]??advice.publication_failed:state==="준비 중"?"본문·표지를 준비 중입니다. 다음 게시 작업 후 반영됩니다.":"현재 원문 버전의 게시 준비가 완료되었습니다.")},
    "원문 ID":{rich_text:rich(row.id)},
  }
}

// This separate, private database is never treated as a publication source.
// Status updates cannot change article revisions or recursively enqueue work.
export async function syncAdminStatus(env:Env, limit=8) {
  const source=await adminConfig(env.CMS_DB,"operations_source")
  if(!source || !normalizeId(source)) return 0
  const current=await env.CMS_DB.prepare(`SELECT c.id,c.kind,json_extract(c.item,'$.title') AS title,c.revision,c.body_revision,j.attempts,j.last_error
    FROM free_content c LEFT JOIN free_jobs j ON j.id=c.id WHERE c.kind IN ('research','notice')
    ORDER BY (j.last_error IS NOT NULL) DESC,(j.id IS NOT NULL) DESC,c.revision DESC`).all<Row>()
  const mappings=await env.CMS_DB.prepare("SELECT id,page_id,fingerprint FROM free_admin_status").all<{id:string;page_id:string;fingerprint:string}>()
  const saved=new Map(mappings.results.map(row=>[row.id,row]))
  const updates:{id:string;properties:Record<string,unknown>}[]=current.results.map(row=>({id:row.id,properties:statusProperties(row)}))
  const recruitmentId=await adminConfig(env.CMS_DB,"recruitment_page")
  if(recruitmentId) {
    const error=await adminConfig(env.CMS_DB,"recruitment_error")
    const ready=(await adminConfig(env.CMS_DB,"recruitment_validated"))===(await adminConfig(env.CMS_DB,"recruitment_deployed"))
    const revision=await adminConfig(env.CMS_DB,"recruitment_revision")
    updates.unshift({id:recruitmentId,properties:{제목:{title:rich("홈페이지 모집 안내")},상태:{select:{name:error?"확인 필요":ready?"게시 완료":"준비 중"}},종류:{select:{name:"모집"}},원문:{url:`https://www.notion.so/${recruitmentId}`},홈페이지:{url:"https://pnusmp.com/recruit"},"원문 ID":{rich_text:rich(recruitmentId)},...(revision?{"원문 수정 시각":{date:{start:revision}}}:{}),안내:{rich_text:rich(error|| (ready?"현재 모집 설정이 사이트에 반영되었습니다.":"다음 게시 작업에서 모집 설정을 반영합니다."))}}})
  }
  const live=new Set(updates.map(row=>row.id))
  for(const row of mappings.results) if(!live.has(row.id)) updates.push({id:row.id,properties:{
    상태:{select:{name:"게시 제외"}}, 홈페이지:{url:null}, 안내:{rich_text:rich("공개 목록에서 제외되었습니다. 원문의 공개 체크·게시일·삭제 여부를 확인하세요.")},
  }})
  let changed=0
  for(const update of updates) {
    const fingerprint=createHash("sha256").update(JSON.stringify(update.properties)).digest("hex")
    const previous=saved.get(update.id)
    if(previous?.fingerprint===fingerprint) continue
    if(changed>=Math.min(25,Math.max(0,limit))) break
    await spend(env.CMS_DB,"admin-status-day",240,86_400_000)
    let pageId=previous?.page_id
    // Recover a create whose response or mapping write was interrupted.
    if(!pageId) {
      const found=await notion<{results:{id:string}[]}>(env,`data_sources/${source}/query`,{filter:{property:"원문 ID",rich_text:{equals:update.id}},page_size:2})
      if(!found) throw new Error("Operations source unavailable")
      if(found.results.length>1) throw new Error("Duplicate operations records")
      pageId=found.results[0]?.id
    }
    const result=pageId
      ?await notion<{id:string}>(env,`pages/${pageId}`,{properties:update.properties},"PATCH")
      :await notion<{id:string}>(env,"pages",{parent:{type:"data_source_id",data_source_id:source},properties:update.properties})
    if(!result) throw new Error("Operations record unavailable")
    await env.CMS_DB.prepare("INSERT INTO free_admin_status(id,page_id,fingerprint) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET page_id=excluded.page_id,fingerprint=excluded.fingerprint")
      .bind(update.id,result.id,fingerprint).run()
    changed++
  }
  return changed
}
