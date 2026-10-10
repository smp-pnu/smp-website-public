// Keep older CMS image links working after the move away from Vercel.
// Only this site's known static images are mapped; other URLs stay unchanged.
const paths = new Set(["/kim-siyoung.png", "/backgrounds/research-desk.webp", "/backgrounds/pnu-campus-upscaled.webp"])
export function cmsImageUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { return value }
  if (url.protocol !== "https:" || url.hostname !== "smp-pnu.vercel.app" || url.username || url.password) return value
  return paths.has(url.pathname) ? `https://pnusmp.com${url.pathname}` : value
}
