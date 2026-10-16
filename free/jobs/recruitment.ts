import {mkdir,writeFile} from "node:fs/promises"
import {normalizeId,type NotionPage} from "../../lib/content-model"
import {defaultRecruitment,parseRecruitment,type Recruitment} from "../../lib/recruitment"
import {notion} from "../server/notion"
import type {Env} from "../server/types"
import {adminConfig,setAdminConfig} from "./admin-schema"

// One settings read per publisher, never per website visitor. Invalid edits
// leave the last validated settings in place and are surfaced to operators.
export async function prepareRecruitment(env:Env) {
  const id=await adminConfig(env.CMS_DB,"recruitment_page")
  const saved=await adminConfig(env.CMS_DB,"recruitment_validated")
  let config:Recruitment=saved?JSON.parse(saved):defaultRecruitment
  if(id&&normalizeId(id)) {
    try {
      const page=await notion<NotionPage>(env,`pages/${id}`)
      if(!page || normalizeId(page.id)!==normalizeId(id))throw new Error("Recruitment unavailable")
      await setAdminConfig(env.CMS_DB,"recruitment_revision",page.last_edited_time??page.created_time)
      config=parseRecruitment(page)
      await setAdminConfig(env.CMS_DB,"recruitment_validated",JSON.stringify(config))
      await setAdminConfig(env.CMS_DB,"recruitment_error","")
    } catch {
      await setAdminConfig(env.CMS_DB,"recruitment_error","모집 설정을 반영하지 못했습니다. 필수 내용과 기수, 접수 시작·종료, 지원 링크를 확인하세요. 이전 설정을 유지합니다.")
      console.warn("Recruitment settings deferred; last validated settings retained")
    }
  }
  await mkdir(".smp-cache",{recursive:true})
  await writeFile(".smp-cache/recruitment.json",JSON.stringify(config))
  const fingerprint=JSON.stringify(config)
  return {fingerprint,changed:fingerprint!==await adminConfig(env.CMS_DB,"recruitment_deployed")}
}
