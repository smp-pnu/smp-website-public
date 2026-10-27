import type { Database } from "../cloudflare/bindings"
export type SecurityAction = "key:add" | "key:remove" | "account:setup" | "account:recover" | "drive:rotate"
// Fixed event names and timestamps only: never keys, IPs, email or PDF content.
// Both time and count caps keep this small on the Free database.
export function securityEventStatements(db: Database, now: number, action: SecurityAction, credentialId?: string) {
  return [
    db.prepare("DELETE FROM security_events WHERE created<? OR id IN (SELECT id FROM security_events ORDER BY id DESC LIMIT -1 OFFSET 199)").bind(now - 90 * 86400000),
    db.prepare("INSERT INTO security_events(action,created) SELECT ?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM admin_credentials WHERE id=?)").bind(action, now, credentialId ?? null, credentialId ?? null),
  ]
}
