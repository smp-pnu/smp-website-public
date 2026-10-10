import type { Database } from "../../cloudflare/bindings"
export type Env = {
  CMS_DB: Database;
  ASSETS: { fetch: typeof fetch };
  API_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  NOTION_TOKEN?: string;
  NOTION_REPORTS_DATA_SOURCE_ID?: string;
  NOTION_NOTICES_DATA_SOURCE_ID?: string;
  NOTION_MEMBERS_DATA_SOURCE_ID?: string;
  NOTION_WEBHOOK_VERIFICATION_TOKEN?: string;
  NOTION_WEBHOOK_SETUP?: string;
  DRIVE_CLEANUP_WEB_APP_URL?: string;
  SMP_FIXTURE?: string;
  SMP_READ_ONLY?: string;
  SMP_SYNC_KIND?: "research" | "notice" | "members";
  // Injected only by the Node publisher; not a deployed binding.
  NOTION_FETCH?: typeof fetch;
  NOTION_WORKLOAD?: "visitor" | "sync" | "publisher" | "webhook";
  NOTION_WAIT_UNTIL?: number;
}
export type Context = { waitUntil(task: Promise<unknown>): void }
export class Busy extends Error { constructor(public seconds = 60) { super("Temporarily busy") } }
