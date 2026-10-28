import type { Draft } from './model'
export type UploadLink = {id: string; title: string; uploadId: string | null; identity: string | null; trashedAt: string | null}
export function linkedUpload(draft: Draft, links: UploadLink[]) {
  const id = draft.id.replaceAll('-', '')
  return links.find(link => link.uploadId === id || link.identity === draft.hash)
}
export function pendingUploads(drafts: Draft[], links: UploadLink[]) {
  return drafts.filter(draft => !draft.trashedAt && !linkedUpload(draft, links))
}
