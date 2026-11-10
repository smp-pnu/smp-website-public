// Version the composition independently of the source PDF/cover.
export const reportShareSize={width:1200,height:630}
export function reportSharePath(coverUrl:string) {
  const match=/^\/report-covers\/([a-f0-9]{32})\/([a-f0-9]{64})\.webp$/.exec(coverUrl)
  return match?`/report-shares/${match[1]}/v1-${match[2]}.png`:null
}
