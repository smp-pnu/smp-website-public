import { readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// The migration currently has no background-job consumer or replacement cover
// store. Keep the convenient deploy command limited to the read-only fixture.
const root = fileURLToPath(new URL("../", import.meta.url))
const configPath = new URL("../dist/server/wrangler.json", import.meta.url)
const args = process.argv.slice(2)
if (args.some(arg => arg !== "--dry-run")) {
  throw new Error("Only --dry-run is supported by the preview deployment command")
}
let config
try { config = JSON.parse(await readFile(configPath, "utf8")) }
catch { throw new Error("Run pnpm build:cloudflare:fixture before deploying the preview") }
if (config.name !== "smp-fixture-preview" || config.vars?.SMP_CF_FIXTURE !== "1") {
  throw new Error("Production migration is incomplete. Only a Cloudflare fixture build may be deployed.")
}
if (config.routes?.length || config.triggers?.crons?.length) {
  throw new Error("The fixture must not have custom-domain routes or scheduled production jobs")
}
const result = spawnSync(process.execPath, [
  "node_modules/wrangler/bin/wrangler.js", "deploy", "--config", fileURLToPath(configPath), ...args,
], { cwd: root, stdio: "inherit", env: process.env })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
