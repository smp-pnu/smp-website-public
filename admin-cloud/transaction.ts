import type { Database, Statement } from "../cloudflare/bindings"
import { HttpError } from "../admin-server/validation"

// D1 batch is transactional. A CHECK guard makes stale revisions abort the
// entire operation, including related file deletion; no partial batch success.
export async function guardedBatch(
  db: Database,
  condition: string,
  params: unknown[],
  statements: Statement[],
) {
  const token = crypto.randomUUID()
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO mutation_checks(token,valid) SELECT ?,CASE WHEN (${condition}) THEN 1 ELSE 0 END`,
        )
        .bind(token, ...params),
      ...statements,
      db.prepare("DELETE FROM mutation_checks WHERE token=?").bind(token),
    ])
  } catch (error) {
    if (/CHECK constraint|mutation_checks/i.test(String(error)))
      throw new HttpError(409, "다른 창에서 자료가 변경됐어요. 새로고침 후 다시 확인해 주세요.")
    throw error
  }
}
