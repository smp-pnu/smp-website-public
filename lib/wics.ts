// FnGuide WICS, checked 2026-10-08: https://www.wiseindex.com/About/WICS
// Keep the official classification separate from report type and investment themes.
export const wicsSectors = [
  { name: "에너지", industries: ["에너지장비및서비스", "석유와가스"] },
  { name: "소재", industries: ["화학", "포장재", "비철금속", "철강", "종이와목재"] },
  { name: "산업재", industries: ["우주항공과국방", "건축제품", "건축자재", "건설", "가구", "전기장비", "복합기업", "기계", "조선", "무역회사와판매업체", "상업서비스와공급품", "항공화물운송과물류", "항공사", "해운사", "도로와철도운송", "운송인프라"] },
  { name: "경기관련소비재", industries: ["자동차부품", "자동차", "가정용기기와용품", "레저용장비와제품", "섬유,의류,신발,호화품", "화장품", "문구류", "호텔,레스토랑,레저", "다각화된소비자서비스", "판매업체", "인터넷과카탈로그소매", "백화점과일반상점", "전문소매", "교육서비스"] },
  { name: "필수소비재", industries: ["식품과기본식료품소매", "음료", "식품", "담배", "가정용품"] },
  { name: "건강관리", industries: ["건강관리장비와용품", "건강관리업체및서비스", "건강관리기술", "생물공학", "제약", "생명과학도구및서비스"] },
  { name: "금융", industries: ["은행", "증권", "창업투자", "카드", "기타금융", "손해보험", "생명보험", "부동산"] },
  { name: "IT", industries: ["IT서비스", "소프트웨어", "통신장비", "핸드셋", "컴퓨터와주변기기", "전자장비와기기", "사무용전자제품", "반도체와반도체장비", "전자제품", "전기제품", "디스플레이 패널", "디스플레이 장비 및 부품"] },
  { name: "커뮤니케이션서비스", industries: ["다각화된통신서비스", "무선통신서비스", "광고", "방송과엔터테인먼트", "출판", "게임엔터테인먼트", "양방향미디어와서비스"] },
  { name: "유틸리티", industries: ["전기유틸리티", "가스유틸리티", "복합유틸리티", "독립전력생산및에너지거래"] },
] as const

const normalized = (value: string) => value.replace(/\s/g, "").replace(/·/g, ",")
const industryNames = new Map(wicsSectors.flatMap(sector => sector.industries.map(industry => [normalized(industry), industry] as const)))
const sectorNames = new Map<string, string>(wicsSectors.flatMap(sector => [
  [sector.name, sector.name] as const, ...sector.industries.map(industry => [industry, sector.name] as const),
]))

export function canonicalIndustry(value: string) { return industryNames.get(normalized(value)) }
export function industrySector(industry?: string) { return industry ? sectorNames.get(canonicalIndustry(industry) ?? industry) : undefined }
export function matchesIndustry(industry: string | undefined, selected: string) {
  return industry === selected || industrySector(industry) === selected
}

export function industryOptions(industries: string[]) {
  const present = new Set(industries.map(industrySector))
  return wicsSectors
    .filter(sector => present.has(sector.name))
    .map(sector => ({ value: sector.name, label: sector.name }))
}

// Notion select option names cannot contain commas.
export function notionIndustry(value: string) { return value.replace(/,/g, "·") }
