import { createHash } from "node:crypto"
import type { Database } from "../cloudflare/bindings"
import { HttpError, object } from "../admin-server/validation"
import { cleanRosterText, memberNameKey, validMemberName, rosterLimits, type ExistingMember, type RosterPerson } from "../admin-lab/member-import-model"
import { cmsLimits, validatePayload, type Payload } from "./model"

export function importGeneration(value: unknown) {
  if(!Number.isInteger(value)||Number(value)<1||Number(value)>999)throw new HttpError(400,"등록할 기수를 확인해 주세요.")
  return Number(value)
}
export async function existingRoster(db:Database,generation:number):Promise<ExistingMember[]> {
  const rows=await db.prepare("SELECT id,json_extract(draft,'$.item.name') name,json_extract(draft,'$.item.department') department,json_extract(draft,'$.item.year') year,trashed_at IS NOT NULL trashed FROM cms_entries WHERE kind='members' AND json_extract(draft,'$.item.generation')=? LIMIT 2500").bind(generation).all<ExistingMember>()
  return rows.results.map(r=>({...r,trashed:!!r.trashed}))
}
function person(raw:unknown):RosterPerson {
  const p=object(raw)
  if(typeof p.row!=="number"||!Number.isInteger(p.row)||p.row<1||p.row>1000||typeof p.name!=="string"||typeof p.department!=="string"||typeof p.year!=="string"||!Array.isArray(p.roles))throw new HttpError(400,"명단의 이름·학과·학번·직책을 확인해 주세요.")
  const name=cleanRosterText(p.name),department=cleanRosterText(p.department),year=p.year.trim()
  if(!validMemberName(name)||department.length>100||/[<>@]|\d{6,}|0\d{1,2}[- .]\d{3,4}[- .]\d{4}/.test(department)||year&&!/^\d{2}$/.test(year)||p.roles.length>3||p.roles.some(r=>!["회장","부회장","기장"].includes(r)))throw new HttpError(400,"명단에 잘못된 값이 있어요. 학번은 입학연도 두 자리만 저장합니다.")
  return {row:p.row,name,department,year,roles:[...new Set(p.roles)]} as RosterPerson
}
export async function importMembers(db:Database,input:unknown,now=Date.now()) {
  const data=object(input),generation=importGeneration(data.generation)
  if(data.reviewed!==true||typeof data.batchId!=="string"||!/^[-a-f0-9]{36}$/.test(data.batchId)||(data.group!=="members"&&data.group!=="alumni")||!Array.isArray(data.members)||!data.members.length||data.members.length>rosterLimits.selected)throw new HttpError(400,"검토한 명단을 한 번에 100명 이하로 선택해 주세요.")
  const people=data.members.map(person),rows=new Set(people.map(p=>p.row))
  if(rows.size!==people.length)throw new HttpError(400,"엑셀 행 번호가 중복됐어요.")
  const existing=await existingRoster(db,generation),known=new Set(existing.map(e=>memberNameKey(e.name)))
  const skipped:{row:number;reason:string}[]=[], pending:{person:RosterPerson;id:string;payload:Payload}[]=[]
  for(const p of people) {
    const key=memberNameKey(p.name)
    if(known.has(key)){skipped.push({row:p.row,reason:"같은 기수에 같은 이름이 등록되어 있어요. 기존 명단에서 확인해 주세요."});continue}
    known.add(key)
    const id=createHash("sha256").update(`${data.batchId}:${p.row}`).digest("hex").slice(0,32)
    const payload:Payload={item:{id,name:p.name,department:p.department,year:p.year,roles:p.roles,generation,group:data.group},blocks:[],cover:null}
    validatePayload(payload,"members",id);pending.push({person:p,id,payload})
  }
  if(!pending.length)return {created:[],skipped,generation}
  const count=await db.prepare("SELECT count(*) n FROM cms_entries").first<{n:number}>()
  if((count?.n??0)+pending.length>cmsLimits.entries)throw new HttpError(409,"관리 자료 한도를 초과해 이번 명단을 저장하지 않았어요.")
  // One SQL statement is atomic and uses one D1 query even for 100 people.
  // No member is automatically published.
  // The conditional insert also catches concurrent imports after the preview.
  let created:string[]
  try {
    const values=pending.map(p=>({id:p.id,draft:p.payload,nameKey:memberNameKey(p.person.name)}))
    const result=await db.prepare(`INSERT INTO cms_entries(id,kind,draft,updated_at,rank)
      SELECT json_extract(j.value,'$.id'),'members',json_extract(j.value,'$.draft'),?,0 FROM json_each(?) j
      WHERE NOT EXISTS(SELECT 1 FROM cms_entries e WHERE e.kind='members' AND json_extract(e.draft,'$.item.generation')=? AND lower(replace(trim(json_extract(e.draft,'$.item.name')),' ',''))=json_extract(j.value,'$.nameKey'))
      ON CONFLICT(id) DO NOTHING RETURNING id`).bind(new Date(now).toISOString(),JSON.stringify(values),generation).all<{id:string}>()
    created=result.results.map(r=>r.id)
  } catch {throw new HttpError(409,"명단을 저장하지 못했어요. 새로고침 후 다시 시도해 주세요. 이 작업은 일부만 저장되지 않습니다.")}
  const inserted=new Set(created)
  for(const p of pending)if(!inserted.has(p.id))skipped.push({row:p.person.row,reason:"이미 처리되었거나 다른 창에서 같은 이름이 등록됐어요."})
  return {created,skipped,generation}
}
