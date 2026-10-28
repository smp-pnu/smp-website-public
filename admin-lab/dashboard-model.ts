import type { Kind } from "../cms/model"

export type Snapshot<T> = { value: T | null; checkedAt: number | null; nextCheckAt: number; stale: boolean }
export type ContentCount = { kind: Kind; total: number; published: number; drafts: number; changed: number; trash: number }
export type DashboardData = {
  content: ContentCount[]
  storage: { adminBytes: number; adminLimit: number; assetsBytes: number; assetsLimit: number; metadataBytes: number; metadataLimit: number; entries: number; entryLimit: number }
  originals: { count: number; driveBytes: number; databaseBytes: number; retainedBytes: number; legacyReports: number; staging: number }
  files: { name: string; bytes: number; provider: string; retained: number }[]
  jobs: { pending: number; failed: number; cleanup: number; cleanupFailed: number }
  daily: { requests: number; requestsLimit: number; uploads: number; uploadsLimit: number; ai: number; aiLimit: number; resetsAt: number }
}
export type DriveCapacity = {
  connected: boolean; email: string | null; folderUrl: string | null
  quota: { limit: number | null; usage: number; remaining: number | null; drive: number | null; trash: number | null; other: number | null } | null
}
export function capacityLabel(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "확인 불가"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"], unit = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** unit).toLocaleString("ko-KR", { maximumFractionDigits: unit ? 2 : 0 })} ${units[unit]}`
}
