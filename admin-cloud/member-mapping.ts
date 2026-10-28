import type { Database } from "../cloudflare/bindings"
import { HttpError, object } from "../admin-server/validation"
import { rosterFields, rosterShapes, suggestMapping, validateRosterMapping, type ColumnProfile, type RosterMapping } from "../admin-lab/member-import-model"
import { metadataDailyLimit, metadataModel, type AiBinding } from "./ai-metadata"
import { sha256 } from "./protocol"

type MappingResult = { mapping: RosterMapping; source: "ai" | "rules"; warning?: string; cached?: boolean }
export function safeColumnProfile(input: unknown): ColumnProfile[] {
  if(!Array.isArray(input)||!input.length||input.length>40)throw new HttpError(400,"엑셀 열 정보를 확인해 주세요.")
  return input.map((raw,index)=>{
    const p=object(raw)
    if(Object.keys(p).some(k=>!["index","hints","shapes"].includes(k))||p.index!==index
      ||!Array.isArray(p.hints)||p.hints.length>6||p.hints.some(h=>!rosterFields.includes(h))
      ||!Array.isArray(p.shapes)||p.shapes.length>3||p.shapes.some(s=>!rosterShapes.includes(s)))throw new HttpError(400,"명단 원문을 AI에 보내지 않고 열 형식만 사용할 수 있어요.")
    return {index,hints:[...new Set(p.hints)],shapes:[...new Set(p.shapes)]} as ColumnProfile
  })
}
export function memberMappingPrompt(columns: ColumnProfile[]) {
  return {messages:[
    {role:"system",content:'회원 명단 엑셀의 열 형식을 보고 필드를 0부터 시작하는 열 번호에 연결하세요. 실제 회원 데이터는 제공되지 않습니다. hints는 헤더에서 확인한 필드, shapes는 셀의 데이터 유형입니다. hints가 있는 열을 우선하세요. 이름=name, 학과=department, 학번 연도=year, 직책=roles, 기수=generation, 활동 상태/비고=status입니다. 불분명하거나 없는 필드는 null, 같은 열은 한 번만 사용하세요. 특히 번호 열을 기수나 학번으로 추측하지 마세요. 설명 없이 JSON 하나만 반환하세요: {"name":null,"department":null,"year":null,"roles":null,"generation":null,"status":null}'},
    {role:"user",content:JSON.stringify(columns)},
  ],temperature:0,max_tokens:240,stream:false}
}
export async function inferMemberMapping(input: unknown, db: Database, ai: AiBinding | undefined, now=Date.now()): Promise<MappingResult> {
  const data=object(input)
  if(data.reviewed!==true)throw new HttpError(400,"열 정보 전송을 확인해 주세요.")
  const columns=safeColumnProfile(data.columns), fallback=suggestMapping(columns)
  const failure=(warning="AI 연결을 사용하지 못해 기본 열 연결을 표시했어요. 직접 확인·수정할 수 있습니다."):MappingResult=>({mapping:fallback,source:"rules",warning})
  if(!ai)return failure()
  const prompt=memberMappingPrompt(columns)
  if(new TextEncoder().encode(JSON.stringify(prompt)).length>8000)throw new HttpError(400,"열 정보가 너무 많아요.")
  const key=await sha256(new TextEncoder().encode(JSON.stringify(["member-columns-v1",columns])))
  await db.prepare("DELETE FROM metadata_extractions WHERE expires<=?").bind(now).run()
  const cached=await db.prepare("SELECT state,payload FROM metadata_extractions WHERE cache_key=?").bind(key).first<{state:string;payload:string}>()
  if(cached)return cached.state==="ready"?{...JSON.parse(cached.payload),cached:true}:failure("같은 형식의 AI 처리가 진행 중이거나 잠시 중단됐어요. 기본 열 연결을 확인해 주세요.")
  const lease=crypto.randomUUID()
  const reserved=await db.prepare("INSERT INTO metadata_extractions(cache_key,state,lease,expires) SELECT ?,'pending',?,? WHERE (SELECT count(*) FROM metadata_extractions)<100 ON CONFLICT(cache_key) DO NOTHING RETURNING cache_key").bind(key,lease,now+60_000).first()
  if(!reserved)return failure()
  const save=async(state:string,result:MappingResult,ttl:number)=>{
    await db.prepare("UPDATE metadata_extractions SET state=?,payload=?,expires=? WHERE cache_key=? AND lease=?").bind(state,JSON.stringify(result),now+ttl,key,lease).run();return result
  }
  // Share the existing PDF extraction allowance. Adding roster support does not
  // increase the account's maximum daily AI workload or retry model calls.
  const day=Math.floor(now/86400000)
  const accepted=await db.prepare("INSERT INTO usage(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits").bind(`metadata-day:${day}`,(day+1)*86400000,metadataDailyLimit).first()
  if(!accepted)return save("failed",failure("오늘의 AI 입력 보완 10회를 모두 사용했어요. 열을 직접 연결하면 명단을 등록할 수 있습니다."),600000)
  let timer:ReturnType<typeof setTimeout>|undefined
  try {
    const response=object(await Promise.race([ai.run(metadataModel,prompt),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("timeout")),30000)})]))
    const raw=typeof response.response==="string"?JSON.parse(response.response):response.response
    const mapping=validateRosterMapping(raw,columns.length)
    // Explicit recognized headers are stronger evidence than a model guess.
    for(const field of rosterFields)if(fallback[field]!==null)mapping[field]=fallback[field]
    const final=validateRosterMapping(mapping,columns.length)
    if(final.name===null)return save("failed",failure("이름 열을 확정하지 못했어요. 이름에 해당하는 열을 직접 선택해 주세요."),600000)
    return save("ready",{mapping:final,source:"ai"},7*86400000)
  } catch {return save("failed",failure(),600000)} finally{clearTimeout(timer)}
}
