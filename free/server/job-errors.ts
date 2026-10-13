import { Busy } from "./types"
const codes=["upstream_busy","source_unavailable","asset_preparation","publication_failed"] as const
export type JobErrorCode=typeof codes[number]
export function safeJobError(value:unknown):JobErrorCode {
  return codes.includes(value as JobErrorCode)?value as JobErrorCode:"publication_failed"
}
export function jobErrorCode(error:unknown):JobErrorCode {
  if(error instanceof Busy) return "upstream_busy"
  const message=error instanceof Error?error.message:""
  if(/removed|unavailable|request|fetch|network|timeout|download/i.test(message)) return "source_unavailable"
  if(/image|asset|pdf|render|pixel|cover/i.test(message)) return "asset_preparation"
  return "publication_failed"
}
