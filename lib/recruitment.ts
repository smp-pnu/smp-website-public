import { plainText, safeUrl, type NotionPage } from "./content-model"

export type Recruitment = {
  generation:number; status:"upcoming"|"open"|"closed"; scheduleConfirmed:boolean;
  period:string; start:string|null; end:string|null; applicationUrl:string|null;
  audience:string; requirement:string; capacity:string; schedule:string; location:string; duration:string; fees:string; process:string;
}
export const defaultRecruitment:Recruitment = {
  generation:41,status:"upcoming",scheduleConfirmed:false,period:"2027년 1~2월",start:null,end:null,applicationUrl:null,
  audience:"부산대학교 학생 · 전공 제한 없음 · 휴학 여부 무관",requirement:"2학기 이상 활동할 수 있는 분",capacity:"추후 안내",
  schedule:"매주 화요일·금요일 18:30부터",location:"부산대학교 강의실",duration:"2학기 이상 · 세부 활동 기간 추후 안내",
  fees:"입회비 40,000원 · 월 회비 15,000원\n납부 방식: 계좌 이체\n투자금 및 반환 조건: 추후 안내",
  process:"서류 접수와 면접, 결과 발표 일정은 모집 공고 확정 후 안내합니다. 최종 합격자에게는 개별 연락드립니다.",
}
function date(value:string|null|undefined,end=false) {
  if(!value)return null
  const timestamp=Date.parse(value.length===10?`${value}T${end?"23:59:59":"00:00:00"}+09:00`:value)
  if(!Number.isFinite(timestamp))throw new Error("Invalid recruitment date")
  return new Date(timestamp).toISOString()
}
export function parseRecruitment(page:NotionPage):Recruitment {
  if(page.archived || page.in_trash)throw new Error("Recruitment settings archived")
  const p=page.properties,generation=p["기수"]?.number
  if(typeof generation!=="number"||!Number.isSafeInteger(generation)||generation<1||generation>200)throw new Error("Invalid recruitment generation")
  const statuses:Record<string,Recruitment["status"]>={"모집 예정":"upcoming","모집 중":"open","모집 마감":"closed"}
  const status=statuses[p["모집 상태"]?.select?.name??""]
  if(!status)throw new Error("Invalid recruitment status")
  const fields={period:"일정 표시",audience:"모집 대상",requirement:"활동 요건",capacity:"모집 인원",schedule:"활동 일정",location:"활동 장소",duration:"활동 기간",fees:"회비 안내",process:"전형 안내"} as const
  const values=Object.fromEntries(Object.entries(fields).map(([key,name])=>{
    const text=plainText(p[name]?.rich_text).trim()
    if(!text||text.length>1500)throw new Error("Invalid recruitment text")
    return [key,text]
  })) as Pick<Recruitment,keyof typeof fields>
  const start=date(p["접수 시작"]?.date?.start),end=date(p["접수 종료"]?.date?.start,true)
  if(start&&end&&start>=end)throw new Error("Recruitment dates reversed")
  const applicationUrl=safeUrl(p["지원 링크"]?.url)
  if(applicationUrl && !applicationUrl.startsWith("https://"))throw new Error("Recruitment URL must use HTTPS")
  if(status==="open"&&(!p["일정 확정"]?.checkbox||!start||!end||!applicationUrl))throw new Error("Open recruitment needs confirmed dates and application URL")
  return {...values,generation,status,scheduleConfirmed:p["일정 확정"]?.checkbox===true,start,end,applicationUrl}
}
export function recruitmentState(config:Recruitment,now=Date.now()) {
  if(config.status!=="open")return config.status
  if(!config.scheduleConfirmed||!config.start||!config.end||!config.applicationUrl)return "upcoming"
  if(now>Date.parse(config.end))return "closed"
  return now<Date.parse(config.start)?"upcoming":"open"
}
