import type { Database } from "../cloudflare/bindings";

export type MemberCohort = {
  generation: number;
  total: number;
  published: number;
  drafts: number;
  members: number;
  alumni: number;
  updatedAt: string;
};

// Aggregate in D1: the overview never downloads every member or queries each
// cohort separately. Search/state choose cohorts; counts describe the whole cohort.
export async function memberCohorts(db: Database, params: URLSearchParams) {
  const q = (params.get("q") ?? "").trim().slice(0, 150);
  const generation = /^\d{1,3}\s*기?$/.test(q) ? Number(q.replace(/\s*기$/, "")) : 0;
  const state = params.get("state") ?? "all";
  const trash = state === "trash";
  const result = await db.prepare(`WITH roster AS (
    SELECT CAST(json_extract(draft,'$.item.generation') AS INTEGER) generation,
      json_extract(draft,'$.item.name') name,
      json_extract(draft,'$.item.department') department,
      json_extract(draft,'$.item.group') member_group,
      approved_revision IS NOT NULL published,
      approved_revision IS NULL OR approved_revision<>revision draft,
      updated_at
    FROM cms_entries WHERE kind='members' AND trashed_at IS ${trash ? "NOT " : ""}NULL
  ) SELECT generation,count(*) total,sum(published) published,sum(draft) drafts,
    sum(member_group='members') members,sum(member_group='alumni') alumni,
    max(updated_at) updatedAt
    FROM roster GROUP BY generation
    HAVING max((?='' OR generation=? OR instr(lower(name),lower(?))>0 OR instr(lower(department),lower(?))>0)
      AND (? NOT IN ('public','draft') OR (?='public' AND published) OR (?='draft' AND draft)))=1
    ORDER BY generation DESC LIMIT 999`).bind(q, generation, q, q, state, state, state).all<MemberCohort>();
  return { items: result.results };
}
