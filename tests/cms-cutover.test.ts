import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Database, Statement } from "../cloudflare/bindings";
import { CmsStore } from "../cms/store";
import { validatePayload, type Payload } from "../cms/model";
import { adminMode } from "../cms/mode";
import { sourceKey } from "../lib/report-source-key";
import type { ContentItem } from "../lib/content-model";
import worker from "../free/server/worker";
import { cmsApi, cmsExport } from "../cms/api";
import { storePages, removePage, enqueue } from "../free/server/catalog";
import { rich } from "../cms/rich-text";
import { sortContent } from "../lib/content-model";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync("cloudflare/migrations").sort())
    sql.exec(readFileSync("cloudflare/migrations/" + f, "utf8"));
  sql.exec(readFileSync("cms/schema.sql", "utf8"));
  sql.exec(readFileSync("cms/budget.sql", "utf8"));
  sql.exec(
    "CREATE TABLE IF NOT EXISTS free_admin_config(name TEXT PRIMARY KEY,value TEXT NOT NULL)",
  );
  const prepare = (s: string, p: unknown[] = []): Statement => ({
    bind: (...v) => prepare(s, v),
    async first<T>() {
      return (sql.prepare(s).get(...(p as never[])) ?? null) as T | null;
    },
    async all<T>() {
      return { results: sql.prepare(s).all(...(p as never[])) as T[] };
    },
    async run() {
      return sql.prepare(s).run(...(p as never[]));
    },
  });
  const db: Database = {
    prepare,
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const r = [];
        for (const s of statements) r.push(await s.run());
        sql.exec("COMMIT");
        return r;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const store = new CmsStore(db, Date.parse("2026-10-27T10:00:00Z"));
  const active = () =>
    sql
      .prepare(
        "INSERT OR REPLACE INTO free_controls(name,until_at) VALUES('cms-source-admin',1)",
      )
      .run();
  const payload: Payload = {
    item: {
      id: "",
      kind: "notice",
      title: "공지 원본",
      date: "2026-10-01",
      summary: "요약",
      category: "공지",
      author: "SMP",
      pinned: false,
      externalUrl: null,
      attachments: [],
    },
    cover: null,
    blocks: [
      {
        id: "a".repeat(32),
        type: "paragraph",
        paragraph: {
          rich_text: [{ plain_text: "굵은 문장", annotations: { bold: true } }],
        },
      },
      {
        id: "b".repeat(32),
        type: "table",
        table: { has_column_header: true },
        children: [
          {
            id: "c".repeat(32),
            type: "table_row",
            table_row: {
              cells: [[{ plain_text: "열1" }], [{ plain_text: "열2" }]],
            },
          },
        ],
      },
    ],
  };
  return { sql, db, store, active, payload, close: () => sql.close() };
}
test("new notices publish in the same manual order as the administrator list", async () => {
  const f = fixture();
  try {
    f.active();
    const first = await f.store.create("notice", structuredClone(f.payload));
    const secondPayload = structuredClone(f.payload);
    (secondPayload.item as ContentItem).date = "2025-01-01";
    const second = await f.store.create("notice", secondPayload);
    await f.store.approve(first.id, 1);
    await f.store.approve(second.id, 1);
    const publicItems = () => sortContent(f.sql.prepare("SELECT item FROM free_content").all().map(r => JSON.parse(String(r.item))));
    const list = await f.store.list("notice", new URLSearchParams());
    assert.deepEqual(publicItems().map(i => i.id), list.items.map(i => i.id));
    await cmsApi(new Request(`https://admin.pnusmp.com/api/cms/entry/${first.id}/move`, {method:"POST"}), {CMS_DB:f.db} as never, {} as never,
      async()=>({revision:1,target:second.id,placement:"before"}), async()=>new Uint8Array(), f.store.now);
    assert.deepEqual(publicItems().map(i => i.id), [first.id,second.id]);
    await f.store.change(first.id,2,"trash");
    assert.deepEqual(publicItems().map(i => i.id),[second.id]);
    await f.store.change(first.id,3,"restore");
    assert.deepEqual(publicItems().map(i => i.id),[second.id]);
    await f.store.approve(first.id,4);
    assert.deepEqual(publicItems().map(i => i.id),[first.id,second.id]);
  } finally { f.close(); }
});
test("member generation filters sort numerically while semester filters stay chronological", async () => {
  const f = fixture();
  try {
    for (const generation of [1, 9, 10, 38, 39, 40]) {
      await f.store.create("members", {
        item: { id: "", name: `점검${generation}`, generation, group: "members", department: "점검", year: "26", roles: [] },
        blocks: [], cover: null,
      });
    }
    assert.deepEqual((await f.store.list("members", new URLSearchParams())).groups, ["40", "39", "38", "10", "9", "1"]);
    for (const semester of ["2025-2", "2026-1", "2026-2"]) {
      const payload = structuredClone(f.payload);
      (payload.item as ContentItem).semester = semester;
      await f.store.create("notice", payload);
    }
    assert.deepEqual((await f.store.list("notice", new URLSearchParams())).groups, ["2026-2", "2026-1", "2025-2"]);
  } finally { f.close(); }
});

test("every CMS insertion path enforces the entry cap atomically", async () => {
  const f=fixture();
  try {
    const insert=f.sql.prepare("INSERT INTO cms_entries(id,kind,draft,updated_at,rank) VALUES(?,'notice',?,'2026-10-01',?)");
    const payload=JSON.stringify(f.payload);
    for(let i=0;i<2500;i++)insert.run(i.toString(16).padStart(32,'0'),payload,i);
    assert.throws(()=>insert.run('f'.repeat(32),payload,2500), /SMP_CMS_ENTRY_LIMIT/);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM cms_entries").get()!.n,2500);
  } finally { f.close(); }
});
test("long Korean and literal wildcard searches remain exact without D1 LIKE patterns", async () => {
  const f=fixture();
  try {
    const p=structuredClone(f.payload);
    (p.item as ContentItem).title="부산대학교 금융투자학회 관리자 공지사항 긴 제목 검색 확인 HPSP 100%_";
    const e=await f.store.create("notice",p);
    for(const q of ["부산대학교 금융투자학회 관리자 공지사항 긴 제목 검색 확인","hpsp","100%_"])
      assert.deepEqual((await f.store.list("notice",new URLSearchParams({q}))).items.map(x=>x.id),[e.id]);
    assert.equal((await f.store.list("notice",new URLSearchParams({q:"100%X"}))).total,0);
  } finally {f.close()}
});
test("CMS staging, approval, draft edits and withdrawal preserve exact nested content and public IDs", async () => {
  const f = fixture();
  try {
    const e = await f.store.create("notice", structuredClone(f.payload));
    await f.store.approve(e.id, 1);
    assert.equal(await adminMode(f.db), false);
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM free_content").get()!.n,
      0,
    );
    f.active();
    await f.store.approve(e.id, 1);
    let publicRow = f.sql
      .prepare("SELECT * FROM free_content WHERE id=?")
      .get(e.id)!;
    assert.deepEqual(JSON.parse(String(publicRow.blocks)), f.payload.blocks);
    const edit = structuredClone(e.draft);
    (edit.item as ContentItem).title = "승인하지 않은 수정";
    await f.store.save(e.id, 1, edit);
    assert.equal(
      JSON.parse(
        String(
          f.sql.prepare("SELECT item FROM free_content WHERE id=?").get(e.id)!
            .item,
        ),
      ).title,
      "공지 원본",
    );
    await assert.rejects(() => f.store.save(e.id, 1, edit), /변경/);
    await f.store.approve(e.id, 2);
    publicRow = f.sql
      .prepare("SELECT * FROM free_content WHERE id=?")
      .get(e.id)!;
    assert.equal(
      JSON.parse(String(publicRow.item)).title,
      "승인하지 않은 수정",
    );
    assert.equal(publicRow.body_revision, publicRow.revision);
    await f.store.change(e.id, 2, "trash");
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM free_content").get()!.n,
      0,
    );
    await f.store.complete(e.id, 2, edit);
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM free_content").get()!.n,
      0,
      "late job must not resurrect trash",
    );
    await f.store.change(e.id, 3, "restore");
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM free_content").get()!.n,
      0,
      "restore is always private",
    );
  } finally {
    f.close();
  }
});
test("PDF approval keeps existing publication until assets are ready; later metadata edits reuse prepared source", async () => {
  const f = fixture();
  try {
    f.active();
    const p = structuredClone(f.payload);
    p.item = {
      ...p.item,
      kind: "research",
      externalUrl: "https://drive.google.com/file/d/abcdefghijk123456789/view",
    } as ContentItem;
    const e = await f.store.create("research", p);
    const queued = await f.store.approve(e.id, 1);
    assert.equal(queued.pending, true);
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM free_content").get()!.n,
      0,
    );
    const ready = {
      ...e.draft,
      cover: {
        sourceKey: sourceKey(e.draft.item as ContentItem),
        url: `/report-covers/${e.id}/${"d".repeat(64)}.webp`,
      },
    };
    await f.store.complete(e.id, 1, ready);
    assert.deepEqual((await f.store.get(e.id)).draft.cover, ready.cover);
    const changed = structuredClone(ready);
    (changed.item as ContentItem).title = "새 제목";
    await f.store.save(e.id, 1, changed);
    assert.equal((await f.store.approve(e.id, 2)).pending, false);
    assert.equal(f.sql.prepare("SELECT count(*) n FROM cms_jobs").get()!.n, 0);
  } finally {
    f.close();
  }
});
test("CMS requests work with stale Notion sync and never call Notion; withdrawal closes media and details", async () => {
  const f = fixture();
  Object.assign(globalThis, { __SMP_FIXTURE__: false });
  try {
    f.active();
    const e = await f.store.create("notice", structuredClone(f.payload)),
      asset = "d".repeat(32),
      url = `https://pnusmp.com/api/cms-media/${asset}`;
    const p = structuredClone(e.draft);
    p.blocks.push({
      id: "e".repeat(32),
      type: "image",
      image: { external: { url } },
    });
    await f.store.save(e.id, 1, p);
    f.sql
      .prepare("INSERT INTO cms_assets VALUES(?,?,?,?,?,?,?)")
      .run(asset, e.id, "photo", "image/webp", 1, "eA==", "2026-10-27");
    await f.store.approve(e.id, 2);
    const env = {
      CMS_DB: f.db,
      ASSETS: { fetch: async () => new Response("<html></html>") },
      NOTION_FETCH: async () => {
        throw Error("Notion must never be called");
      },
    };
    for (const path of [
      "/api/catalog/notice",
      "/api/search",
      `/api/detail/notice/${e.id}`,
      `/api/cms-media/${asset}`,
      "/feed.xml",
      "/sitemap-notice.xml",
    ]) {
      const r = await worker.fetch(
        new Request("https://pnusmp.com" + path),
        env,
        { waitUntil() {} },
      );
      assert.equal(r.status, 200, path);
    }
    await worker.scheduled(
      { scheduledTime: Date.now() },
      { ...env, SMP_SYNC_KIND: "notice" },
      { waitUntil() {} },
    );
    await f.store.change(e.id, 2, "withdraw");
    assert.equal(
      (
        await worker.fetch(
          new Request("https://pnusmp.com/api/cms-media/" + asset),
          env,
          { waitUntil() {} },
        )
      ).status,
      404,
    );
  } finally {
    f.close();
  }
});
test("CMS filters escape wildcards, enforce revisions and reject executable or oversized content", async () => {
  const f = fixture();
  try {
    const e = await f.store.create("notice", structuredClone(f.payload));
    assert.equal(
      (await f.store.list("notice", new URLSearchParams({ q: "%" }))).total,
      0,
    );
    const p = structuredClone(e.draft);
    p.blocks[0].paragraph = {
      rich_text: [{ plain_text: "x", href: "javascript:alert(1)" }],
    };
    assert.throws(() => validatePayload(p, "notice", e.id), /https/);
    p.blocks = [
      { id: "a".repeat(32), type: "html", html: { text: "<script>" } },
    ];
    assert.throws(() => validatePayload(p, "notice", e.id), /지원하지/);
    assert.equal(
      rich("**굵게** 그리고 [링크](https://example.com)")[0].annotations?.bold,
      true,
    );
  } finally {
    f.close();
  }
});
test("public export requires a revision-bound expiring grant and never exposes arbitrary stored files", async () => {
  const f = fixture();
  try {
    const env = {
      CMS_DB: f.db,
      ADMIN_DB: f.db,
      ASSETS: { fetch },
      ORIGIN: "https://admin.pnusmp.com",
    } as Parameters<typeof cmsExport>[1];
    await assert.rejects(
      () =>
        cmsExport(
          new Request(
            "https://admin.pnusmp.com/api/cms-export/" + "a".repeat(32) + "/0",
          ),
          env,
          {} as never,
          Date.now(),
        ),
      /Not found/,
    );
    await assert.rejects(
      () =>
        cmsExport(
          new Request(
            "https://admin.pnusmp.com/api/cms-export/" + "a".repeat(32) + "/0",
            { headers: { Authorization: "Bearer " + "f".repeat(64) } },
          ),
          env,
          {} as never,
          Date.now(),
        ),
      /Not found/,
    );
  } finally {
    f.close();
  }
});

test("CMS metadata budget fails before the free D1 capacity and does not corrupt the counter", async () => {
  const f = fixture();
  try {
    await f.store.create("notice", structuredClone(f.payload));
    const measured = () =>
      f.sql
        .prepare(
          "SELECT COALESCE((SELECT sum(length(CAST(draft AS BLOB))+COALESCE(length(CAST(approved AS BLOB)),0)) FROM cms_entries),0)+COALESCE((SELECT sum(length(CAST(payload AS BLOB))) FROM cms_history),0) n",
        )
        .get()!.n;
    assert.equal(
      f.sql.prepare("SELECT bytes FROM cms_metadata_budget").get()!.bytes,
      measured(),
    );
    f.sql.prepare("UPDATE cms_metadata_budget SET bytes=67108864").run();
    await assert.rejects(
      () => f.store.create("notice", structuredClone(f.payload)),
      /SMP_CMS_METADATA_LIMIT/,
    );
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM cms_entries").get()!.n,
      1,
    );
  } finally {
    f.close();
  }
});

test("late Notion delivery cannot remove, overwrite or enqueue admin publications", async () => {
  const f = fixture();
  try {
    f.active();
    const e = await f.store.create("notice", structuredClone(f.payload));
    await f.store.approve(e.id, 1);
    const env = {
      CMS_DB: f.db,
      NOTION_TOKEN: "fixture",
      NOTION_NOTICES_DATA_SOURCE_ID: "f".repeat(32),
    } as never;
    await removePage(env, e.id, "2099-01-01T00:00:00Z");
    await enqueue(env, e.id, "2099-01-01T00:00:00Z");
    await storePages(
      env,
      [
        {
          id: e.id,
          object: "page",
          created_time: "2099-01-01T00:00:00Z",
          archived: true,
          parent: { type: "data_source_id", data_source_id: "f".repeat(32) },
          properties: {},
        },
      ],
      "notice",
    );
    assert.equal(
      f.sql.prepare("SELECT count(*) n FROM free_content").get()!.n,
      1,
    );
    assert.equal(f.sql.prepare("SELECT count(*) n FROM free_jobs").get()!.n, 0);
  } finally {
    f.close();
  }
});

test("cutover atomically preserves public IDs, keeps a rollback snapshot and fences the old publisher", async () => {
  const { activateAdmin } = await import("../cms/cutover");
  const f = fixture();
  try {
    const e = await f.store.create("notice", structuredClone(f.payload));
    f.active();
    await f.store.approve(e.id, 1);
    f.sql
      .prepare("DELETE FROM free_controls WHERE name='cms-source-admin'")
      .run();
    const before = f.sql.prepare("SELECT * FROM free_content").get();
    const result = await activateAdmin(f.db);
    assert.equal(result.published, 1);
    assert.equal(await adminMode(f.db), true);
    assert.deepEqual(
      f.sql.prepare("SELECT * FROM cms_legacy_public").get(),
      before,
    );
    assert.equal(
      f.sql
        .prepare("SELECT count(*) n FROM free_controls WHERE name='publisher'")
        .get()!.n,
      0,
    );
    await assert.rejects(() => activateAdmin(f.db), /already active/);
  } finally {
    f.close();
  }
});

test('list pagination clamps after deletion and handles fractional, empty and out-of-range requests',async()=>{
 const f=fixture();
 try {
  const entries=[];
  for(let i=0;i<41;i++)entries.push(await f.store.create('notice',structuredClone(f.payload)));
  assert.equal((await f.store.list('notice',new URLSearchParams({page:'99'}))).page,2);
  assert.equal((await f.store.list('notice',new URLSearchParams({page:'1.9'}))).page,1);
  await f.store.change(entries[0].id,1,'trash');
  const last=await f.store.list('notice',new URLSearchParams({page:'2'}));
  assert.equal(last.page,1);assert.equal(last.items.length,40);
  const empty=await f.store.list('notice',new URLSearchParams({page:'99',q:'not found'}));
  assert.equal(empty.page,1);assert.equal(empty.total,0);assert.equal(empty.items.length,0);
 }finally{f.close()}
});
