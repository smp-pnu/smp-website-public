export const adminSections = ['dashboard','research','notice','members','recruitment','upload','security','storage'] as const
export type AdminSection = typeof adminSections[number]
export function adminSection(hash: string): AdminSection {
  const value = hash.replace(/^#/, '')
  return adminSections.includes(value as AdminSection) ? value as AdminSection : 'dashboard'
}
export function writeAdminSection(section: AdminSection) {
  history.replaceState(null, '', location.pathname + location.search + '#' + section)
}
const resumeKey = 'smp-admin-upload-return'
export type UploadReturn = {target?: string; title?: string; expires: number}
export function saveUploadReturn(target?: string, title?: string) {
  try { sessionStorage.setItem(resumeKey, JSON.stringify({target,title,expires:Date.now()+30*60_000})) } catch { /* The ordinary upload menu remains available. */ }
}
export function readUploadReturn(): UploadReturn | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(resumeKey) ?? 'null')
    if (!value || !Number.isFinite(value.expires) || value.expires <= Date.now() || value.expires > Date.now()+30*60_000 || (value.target!==undefined && !/^[a-f0-9]{32}$/.test(value.target)) || (value.title!==undefined && (typeof value.title!=='string' || value.title.length>500))) return null
    return value
  } catch { return null }
}
export function clearUploadReturn() { try {sessionStorage.removeItem(resumeKey)} catch {} }
