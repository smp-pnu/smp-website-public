import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Database, Statement } from "../cloudflare/bindings";
import { memberCohorts } from "../cms/member-cohorts";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("cms/schema.sql", "utf8"));
  let queries = 0;
  const prepare = (query: string, params: unknown[] = []): Statement => ({
    bind: (...v) => prepare(query, v),
    async first<T>() { queries++; return (sql.prepare(query).get(...params as never[]) ?? null) as T | null; },
    async all<T>() { queries++; return { results: sql.prepare(query).all(...params as never[]) as T[] }; },
    async run() { queries++; return sql.prepare(query).run(...params as never[]); },
  });
  const db: Database = { prepare, async batch() { throw Error("No batch expected"); } };
  const insert = sql.prepare("INSERT INTO cms_entries(id,kind,draft,revision,approved_revision,updated_at,trashed_at) VALUES(?,'members',?,?,?,?,?)");
  for (const [id, generation, name, group, approved, trash] of [
    ["a", 40, "가회원", "members", 2, null],
    ["b", 40, "나회원", "members", 1, null],
    ["c", 40, "다회원", "members", null, null],
    ["d", 39, "라회원", "alumni", 2, null],
    ["e", 39, "마회원", "members", 2, null],
    ["f", 38, "바회원", "alumni", null, "2026-10-28"],
  ]) insert.run(id, JSON.stringify({ item: { id, generation, name, group, department: generation === 40 ? "경영학과" : "통계학과" }, blocks: [], cover: null }), 2, approved, "2026-10-28T00:00:00Z", trash);
  return { sql, db, queries: () => queries };
}

test("cohort overview aggregates complete cohorts in one query without leaking member payloads", async () => {
  const { sql, db, queries } = fixture();
  try {
    const rows = (await memberCohorts(db, new URLSearchParams())).items;
    assert.equal(queries(), 1);
    assert.deepEqual(rows.map(r => r.generation), [40, 39]);
    assert.deepEqual({ ...rows[0] }, { generation: 40, total: 3, published: 2, drafts: 2, members: 3, alumni: 0, updatedAt: "2026-10-28T00:00:00Z" });
    assert.equal(rows[1].members, 1); assert.equal(rows[1].alumni, 1);
    assert.doesNotMatch(JSON.stringify(rows), /가회원|경영학과|blocks|approved_revision/);
  } finally { sql.close(); }
});

test("cohort search and status filter find relevant cohorts while retaining full cohort counts", async () => {
  const { sql, db } = fixture();
  try {
    for (const q of ["40", "40기", "40 기", "나회원", "경영"]) {
      const rows = (await memberCohorts(db, new URLSearchParams({ q }))).items;
      assert.deepEqual(rows.map(r => r.generation), [40]); assert.equal(rows[0].total, 3);
    }
    assert.deepEqual((await memberCohorts(db, new URLSearchParams({ state: "draft" }))).items.map(r => r.generation), [40]);
    assert.equal((await memberCohorts(db, new URLSearchParams({ state: "draft", q: "가회원" }))).items.length, 0);
    const trash = (await memberCohorts(db, new URLSearchParams({ state: "trash" }))).items;
    assert.deepEqual(trash.map(r => r.generation), [38]); assert.equal(trash[0].total, 1);
    for (const q of ["%", "' OR 1=1 --", "999기"]) assert.equal((await memberCohorts(db, new URLSearchParams({ q }))).items.length, 0);
  } finally { sql.close(); }
});

test("changing a member's cohort or trash status updates grouping without creating separate cohort records", async () => {
  const { sql, db } = fixture();
  try {
    sql.exec("UPDATE cms_entries SET draft=json_set(draft,'$.item.generation',41) WHERE id='c'");
    let rows = (await memberCohorts(db, new URLSearchParams())).items;
    assert.deepEqual(rows.map(r => r.generation), [41, 40, 39]); assert.equal(rows[0].total, 1);
    sql.exec("UPDATE cms_entries SET trashed_at='2026-10-28' WHERE id='c'");
    rows = (await memberCohorts(db, new URLSearchParams())).items;
    assert.deepEqual(rows.map(r => r.generation), [40, 39]);
    assert.equal(sql.prepare("SELECT count(*) n FROM cms_entries").get()!.n, 6);
  } finally { sql.close(); }
});
