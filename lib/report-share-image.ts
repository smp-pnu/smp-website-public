// Shared by the browser, Worker and trusted publishing runner. This fingerprint
// is a cache version, not an authentication or integrity primitive.
export type ShareText = {title?: string; company?: string}
const clean = (value: string | undefined) => (value ?? '').normalize('NFC').replace(/\s+/g,' ').trim().slice(0,500)
export function reportShareCopy(item: ShareText = {}) {
  const company=clean(item.company), original=clean(item.title)
  let title=original
  if(company && title.startsWith(`[${company}]`))title=title.slice(company.length+2).trim()
  else if(company && title.startsWith(company+' - '))title=title.slice(company.length+3).trim()
  return {company:company || 'SMP 리서치',title:title || original || '기업·산업 분석 리포트'}
}
export function reportShareKey(item: ShareText = {}) {
  let hash=BigInt('0xcbf29ce484222325')
  for(const char of JSON.stringify(reportShareCopy(item))) {
    hash=BigInt.asUintN(64,(hash^BigInt(char.codePointAt(0)!))*BigInt('0x100000001b3'))
  }
  return hash.toString(16).padStart(16,'0')
}
export const reportShareSize={width:2400,height:1260}
export function reportSharePath(coverUrl:string,item: ShareText = {}) {
  const match=/^\/report-covers\/([a-f0-9]{32})\/([a-f0-9]{64})\.webp$/.exec(coverUrl)
  return match?`/report-shares/${match[1]}/v2-${match[2]}-${reportShareKey(item)}.jpg`:null
}
