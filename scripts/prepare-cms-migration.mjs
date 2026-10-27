// Offline only: snapshots in, private review files + local SQLite out.
// No network, credentials, remote DB or publication path.
import { readFile, mkdir, writeFile, realpath, lstat, chmod } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import { createMigrationPlan } from "../admin-migration/plan.ts"
import { stagePlan } from "../admin-migration/rehearsal.ts"

const args = process.argv.slice(2)
if (args.length !== 4 || args[0] !== "--snapshot" || args[2] !== "--out") {
  throw Error("Use --snapshot PRIVATE_DIR --out NEW_PRIVATE_DIR")
}
const root = await realpath(args[1])
const requestedOut = path.resolve(args[3])
const repo = await realpath(path.resolve(import.meta.dirname, ".."))
const out = path.join(await realpath(path.dirname(requestedOut)), path.basename(requestedOut))
if (out === root || out.startsWith(root + path.sep) || out === repo || out.startsWith(repo + path.sep)) {
  throw Error("Keep generated private data outside the snapshot and Git repository")
}

const files = new Set()
for (const name of ["notion-snapshot-manifest.json", "cloud-snapshot-manifest.json"]) {
  const manifest = JSON.parse(await readFile(path.join(root, name), "utf8"))
  for (const entry of manifest.files) {
    if (path.basename(entry.file) !== entry.file) throw Error("Unsafe snapshot path")
    const file = path.join(root, entry.file)
    if ((await lstat(file)).isSymbolicLink()) throw Error("Snapshot symlinks are not allowed")
    const bytes = await readFile(file)
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256 || bytes.length !== entry.bytes) {
      throw Error("Snapshot checksum mismatch: " + entry.file)
    }
    files.add(entry.file)
  }
}
const load = async name => {
  if (!files.has(name)) throw Error("Missing verified snapshot " + name)
  return JSON.parse(await readFile(path.join(root, name), "utf8"))
}
const summary = await load("notion-summary.json")
if (summary.bodyErrors?.length) throw Error("Source snapshot is incomplete")
const sources = Object.fromEntries(await Promise.all(
  ["research", "notice", "members"].map(async kind => [kind, await load(kind + "-pages.json")]),
))
for (const [kind, rows] of Object.entries(sources)) {
  if (rows.length !== summary.sources[kind]?.count) throw Error("Source count mismatch: " + kind)
}
const noticeBodies = {}
for (const notice of sources.notice) {
  const id = notice.id.replaceAll("-", "")
  noticeBodies[id] = await load("notice-body-" + id + ".json")
}
const plan = createMigrationPlan({
  capturedAt: summary.finishedAt, sources, noticeBodies,
  publication: await load("production-free_content.json"),
})

// Requiring a fresh directory protects both the source and prior rehearsals.
await mkdir(out, { recursive: false, mode: 0o700 })
const save = async (name, data) => writeFile(path.join(out, name), JSON.stringify(data, null, 2), { mode: 0o600 })
await save("migration-plan.json", plan)
const dbPath = path.join(out, "rehearsal.sqlite")
const db = new DatabaseSync(dbPath)
let first, repeat, counts
try {
  first = stagePlan(db, plan)
  repeat = stagePlan(db, plan)
  counts = db.prepare("SELECT kind,count(*) AS count FROM migration_records GROUP BY kind").all()
} finally {
  db.close()
}
await chmod(dbPath, 0o600)
const result = {
  first, repeat, counts, cutoverAllowed: false, stats: plan.stats,
  blockers: plan.issues.filter(issue => issue.severity === "blocker").length,
  sharedAssets: plan.sharedAssets.length,
}
await save("rehearsal-results.json", result)
await save("preserved-urls.json", plan.records.filter(record => record.kind !== "members").map(record => ({
  sourceKey: record.sourceKey,
  url: `https://pnusmp.com/${record.kind}/${record.legacyPublicId}`,
  wasPublished: record.effectivePublished,
})))
console.log(JSON.stringify(result))
