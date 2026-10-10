import type { ContentItem } from "./content-model"

function secureUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null
  } catch { return null }
}

// Extract a file ID, never a folder or an arbitrary proxy destination.
export function driveDownloadUrl(value: string) {
  const url = secureUrl(value)
  if (!url || url.hostname !== "drive.google.com") return null
  const id = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1]
    ?? (["/open", "/uc"].includes(url.pathname) ? url.searchParams.get("id") : null)
  if (!id || !/^[\w-]{10,200}$/.test(id)) return null
  const download = new URL("https://drive.usercontent.google.com/download")
  download.searchParams.set("id", id)
  download.searchParams.set("export", "download")
  const resourceKey = url.searchParams.get("resourcekey")
  if (resourceKey && /^[\w-]{1,200}$/.test(resourceKey)) download.searchParams.set("resourcekey", resourceKey)
  return download.href
}

export function isNotionFileUrl(value: string) {
  const url = secureUrl(value)
  return !!url && (url.hostname === "prod-files-secure.s3.us-west-2.amazonaws.com"
    // Notion uploads in the Korea data region use a separate, exact bucket.
    || url.hostname === "prod-files-secure-apne2.s3.ap-northeast-2.amazonaws.com"
    || url.hostname === "secure.notion-static.com"
    || (url.hostname === "s3.us-west-2.amazonaws.com" && url.pathname.startsWith("/secure.notion-static.com/")))
}

// A first-party redirect may only point at our established file providers.
export function isTrustedAttachmentUrl(value: string) {
  return !!driveDownloadUrl(value) || isNotionFileUrl(value)
}

export type PdfSource = { name: string; url: string; query: string }

export function getPdfSources(item: Pick<ContentItem, "title" | "attachments" | "externalUrl">): PdfSource[] {
  const files = item.attachments.flatMap((file, index) => {
    const driveUrl = driveDownloadUrl(file.url)
    if (driveUrl) return [{ name: file.name, url: driveUrl, query: `index=${index}` }]
    if (/\.pdf$/i.test(file.name) && isNotionFileUrl(file.url)) return [{ ...file, query: `index=${index}` }]
    return []
  })
  const external = item.externalUrl && driveDownloadUrl(item.externalUrl)
  if (external) files.push({ name: `${item.title}.pdf`, url: external, query: "source=external" })
  return files
}

export function isAllowedPdfUrl(value: string) {
  const url = secureUrl(value)
  return !!url && ((url.hostname === "drive.usercontent.google.com" && url.pathname === "/download") || isNotionFileUrl(value))
}
