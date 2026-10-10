import { build } from "esbuild"
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
const root = path.resolve(import.meta.dirname, "..")
const fixture = process.argv.includes("--fixture")
if (process.argv.some(arg => arg.startsWith("--") && arg !== "--fixture")) throw new Error("Unsupported build option")
function run(file, args = []) { const result = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: "inherit" }); if (result.status !== 0) throw new Error(`Build failed: ${file}`) }
run("scripts/prepare-pdf.mjs"); run("scripts/prepare-backgrounds.mjs")
run("node_modules/vite/bin/vite.js", ["build", "--config", "free/vite.config.ts"])
const client = path.join(root, "dist/free/client")
await mkdir(path.join(client,"api"),{recursive:true})
await writeFile(path.join(client,"api/health"),JSON.stringify({ok:true,mode:fixture?"fixture":"free",readOnly:fixture}))
await cp(path.join(root, "public"), client, { recursive: true, filter: name => !["home-gwangan-3.png", "page-gwangan-3.png", ".assetsignore", "_headers"].includes(path.basename(name)) })
const covers = path.join(root, ".smp-cache/covers")
try { await cp(covers, path.join(client,"report-covers"), { recursive: true, filter: name => !name.endsWith(".json") && (!fixture || name===covers || path.relative(covers,name).split(path.sep)[0]==="a0000000000000000000000000000001") }) } catch (error) { if (error.code !== "ENOENT") throw error }
const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
await writeFile(path.join(client,"_headers"), `/*\n  Content-Security-Policy: ${policy}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Strict-Transport-Security: max-age=31536000\n${fixture ? "  X-Robots-Tag: noindex, nofollow, noarchive\n" : ""}/api/health\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: public, max-age=300\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/report-covers/*\n  Cache-Control: public, max-age=31536000, immutable\n`)
await build({ entryPoints: ["free/server/worker.ts"], outfile: "dist/free/worker.js", bundle: true, platform: "neutral", target: "es2022", format: "esm", minify: true,
  external: ["node:*"], define: { __SMP_FIXTURE__: String(fixture) }, alias: fixture ? { "@/lib/upstream-fetch": path.join(root,"tests/cloudflare/fixture.ts") } : {},
  plugins: [{ name: "server-marker", setup(api) { api.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "marker" })); api.onLoad({ filter: /.*/, namespace: "marker" }, () => ({ contents: "export {}" })) } }],
})
if (!fixture && (!process.env.SMP_FREE_DATABASE_ID || process.env.SMP_FREE_DATABASE_ID === "16cf8db5-1f95-48f3-af68-b32cfa7f7908")) throw new Error("A separate production D1 database is required")
const config = {
  name: fixture ? "smp-fixture-preview" : "smp-website-free", account_id: process.env.CLOUDFLARE_ACCOUNT_ID ?? "f4dcd5f46e5ca4400e2b3449ea5e4497",
  main: "worker.js", no_bundle: true, find_additional_modules: false, compatibility_date: "2026-10-09", compatibility_flags: ["nodejs_compat"],
  assets: { directory: "client", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*","!/api/health"] },
  d1_databases: [{ binding: "CMS_DB", database_name: fixture ? "smp-migration-preview" : "smp-website-free", database_id: fixture ? "16cf8db5-1f95-48f3-af68-b32cfa7f7908" : process.env.SMP_FREE_DATABASE_ID, migrations_dir: "../../cloudflare/migrations" }],
  vars: { SMP_RUNTIME: "cloudflare", SMP_FIXTURE: fixture ? "1" : "0", SMP_READ_ONLY: fixture ? "1" : "0", ...(fixture ? {
    NOTION_TOKEN: "local-cloudflare-fixture", NOTION_REPORTS_DATA_SOURCE_ID: "33333333333343338333333333333333", NOTION_NOTICES_DATA_SOURCE_ID: "22222222222242228222222222222222", NOTION_MEMBERS_DATA_SOURCE_ID: "44444444444444448444444444444444",
  } : {}) },
  ratelimits: [{ name: "API_RATE_LIMIT", namespace_id: "1001", simple: { limit: 1200, period: 60 } }],
  workers_dev: true, preview_urls: false,
  triggers: { crons: [] },
}
await writeFile("dist/free/wrangler.json", JSON.stringify(config, null, 2))
if(!fixture) for(const kind of ["research","notice","members"]) {
  const {assets,ratelimits,...sync}=config
  await writeFile(`dist/free/sync-${kind}.json`,JSON.stringify({...sync,name:`smp-sync-${kind}`,workers_dev:false,
    vars:{...config.vars,SMP_SYNC_KIND:kind},triggers:{crons:["* * * * *"]}},null,2))
}
let files = 0, bytes = 0
async function inspect(dir) { for (const name of await readdir(dir)) { const file=path.join(dir,name), info=await stat(file); if(info.isDirectory()) await inspect(file); else { files++; bytes+=info.size; if(info.size>25*1024*1024) throw new Error(`Oversized asset: ${name}`) } } }
await inspect(client)
if (files > 18_000) throw new Error("Static file safety limit exceeded")
const worker = await readFile("dist/free/worker.js", "utf8")
if (/react-dom|renderToReadableStream|@vercel\/blob|napi-rs\/canvas/.test(worker)) throw new Error("Heavy runtime dependency entered Worker")
await writeFile("dist/free/build-info.json", JSON.stringify({ fixture, files, assetBytes: bytes, workerBytes: Buffer.byteLength(worker), builtAt: new Date().toISOString() }, null, 2))
console.log(JSON.stringify({ fixture, files, assetMiB: +(bytes/1024/1024).toFixed(2), workerKiB: +(Buffer.byteLength(worker)/1024).toFixed(2) }))
