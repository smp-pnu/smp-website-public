import type { Database } from "../cloudflare/bindings";
export async function adminMode(db: Database) {
  return (
    (
      await db
        .prepare(
          "SELECT until_at FROM free_controls WHERE name='cms-source-admin'",
        )
        .first<{ until_at: number }>()
    )?.until_at === 1
  );
}
