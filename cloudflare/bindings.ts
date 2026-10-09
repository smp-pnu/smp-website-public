// Only the Workers build imports this module. Node tests/jobs use adapters.
import { env } from "cloudflare:workers"

export interface Statement {
  bind(...values: unknown[]): Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface Database {
  prepare(query: string): Statement
  batch(statements: Statement[]): Promise<unknown[]>
}
export function database(): Database {
  const db = (env as { CMS_DB?: Database }).CMS_DB
  if (!db) throw new Error("CMS database is not configured")
  return db
}
