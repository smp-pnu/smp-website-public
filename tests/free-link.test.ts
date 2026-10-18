import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

// The main suite enables React Server Components; the browser adapter needs the
// standard React export, so exercise it in a separate client-condition process.
test("Cloudflare links preserve navigation callbacks and native link behavior", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", String.raw`
import { test } from "node:test"
import assert from "node:assert/strict"
import Link from "./free/client/adapters/link.tsx"

test("search navigation runs its close/transition hook once without a second route change", () => {
  let navigations = 0
  const element = Link({ href: "/search?q=인바디", onNavigate: event => { navigations++; event.preventDefault() } })
  const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
  element.props.onClick(event)
  assert.equal(navigations, 1)
  assert.equal(event.defaultPrevented, true, "RouterLink must not navigate a second time")
  assert.equal(element.props.onNavigate, undefined, "the unsupported callback must not leak to the DOM")
})

test("modified clicks, download links, external links and cancelled clicks keep their normal behavior", () => {
  let navigations = 0
  const onNavigate = () => { navigations++ }
  for (const change of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    Link({ href: "/research", onNavigate }).props.onClick({ button: 0, defaultPrevented: false, ...change })
  }
  Link({ href: "/research", target: "_blank", onNavigate }).props.onClick({ button: 0 })
  for (const props of [{ href: "https://pnusmp.com/research" }, { href: "/report.pdf", download: true }]) {
    const element = Link({ ...props, onNavigate })
    assert.equal(element.type, "a")
    assert.equal(element.props.onNavigate, undefined)
  }
  assert.equal(navigations, 0)
})

`], { encoding: "utf8", timeout: 10_000 })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
