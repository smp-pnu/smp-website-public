// Company names and logo order follow the provided Alumni source image.
// These are listed organizations, not a count of alumni or current employees.
export const alumniEmployers = [
  { name: "BNK투자증권", sector: "증권사" },
  { name: "상상인증권", sector: "증권사" },
  { name: "한화투자증권", sector: "증권사" },
  { name: "흥국자산운용", sector: "자산운용·투자일임" },
  { name: "라이나생명", sector: "보험" },
  { name: "한국자산관리공사", sector: "공공금융기관" },
  { name: "한국IR협의회", sector: "협동조합·협회" },
  { name: "우리은행", sector: "은행" },
  { name: "펌텍코리아", sector: "일반기업·전문서비스" },
  { name: "NH투자증권", sector: "증권사" },
  { name: "하나은행", sector: "은행" },
  { name: "IBK기업은행", sector: "은행" },
  { name: "트로이투자일임", sector: "자산운용·투자일임" },
  { name: "iM증권", sector: "증권사" },
  { name: "LS증권", sector: "증권사" },
  { name: "유안타증권", sector: "증권사" },
  { name: "한국산업은행", sector: "은행" },
  { name: "타이거자산운용투자일임", sector: "자산운용·투자일임" },
  { name: "KB투자증권", sector: "증권사" },
  { name: "한국투자증권", sector: "증권사" },
  { name: "신용보증기금", sector: "공공금융기관" },
  { name: "한국투자신탁운용", sector: "자산운용·투자일임" },
  { name: "신한투자증권", sector: "증권사" },
  { name: "미래에셋증권", sector: "증권사" },
  { name: "주택도시보증공사", sector: "공공금융기관" },
  { name: "코리아에셋투자증권", sector: "증권사" },
  { name: "수협", sector: "협동조합·협회" },
  { name: "타임폴리오자산운용", sector: "자산운용·투자일임" },
  { name: "NICE평가정보", sector: "신용평가·금융정보" },
  { name: "노을", sector: "일반기업·전문서비스" },
  { name: "PwC", sector: "일반기업·전문서비스" },
  { name: "한국기업평가", sector: "신용평가·금융정보" },
  { name: "한국주택금융공사", sector: "공공금융기관" },
  { name: "넥센타이어", sector: "일반기업·전문서비스" },
  { name: "신한은행", sector: "은행" },
] as const

const financialSectorOrder = ["증권사", "은행", "자산운용·투자일임", "공공금융기관", "협동조합·협회", "신용평가·금융정보", "보험"] as const

export const financialSectors = financialSectorOrder.map(name => ({
  name, companies: alumniEmployers.filter(company => company.sector === name).map(company => company.name),
}))
export const financialEmployerCount = financialSectors.reduce((total, sector) => total + sector.companies.length, 0)
