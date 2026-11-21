# Browser QA

`pnpm test:e2e` runs the real website and administrator UI against disposable,
synthetic local data. It never signs into production, calls Workers AI, deploys,
or modifies Notion or Google Drive. The suite uses fixed loopback URLs and refuses
to reuse an already-running server. Do not replace them with a live domain.

## Run and diagnose

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:report
# Inspect a failing test's local trace:
pnpm exec playwright show-trace test-results/<failed-test>/trace.zip
```

Node 24, OpenSSL and ports 3005/3019 are required. Desktop and mobile-width
Chromium run sequentially. Mobile emulation is not a physical iPhone/Safari test;
real-device passkey, Bluetooth/QR and platform-specific fullscreen checks still
need occasional manual testing.

The public fixture contains 600 synthetic reports and 300 notices. Its first
report has a three-page prepared image pack and matching synthetic PDF. The
administrator runs the production Worker, database migrations and screens with
an in-memory Google adapter and a local, one-day TLS certificate. Only the UI's
build-time hostname guard changes to localhost; WebAuthn signature verification,
session cookies, CSRF and server Origin checks remain active. Each administrator
test registers a virtual passkey against a fresh disposable database. No real
passwords, passkeys, recovery codes, tokens or member records enter artifacts.

Covered journeys: home search/all results/list return; prepared PDF navigation,
zoom, desktop spread and download; passkey login/logout and 24-hour cookie;
PDF upload/review/edit/publication queue; notice composition/preview/publication;
cohort member creation, roles and edits. Report publication is asserted up to the
preparation queue, not the external GitHub publishing run. Existing runtime tests
continue to cover replacement, deletion, authorization and publisher processing.

## Weekly checks and evidence

GitHub Actions → **Browser QA** runs on pull requests, main changes, manual request
and Mondays at 11:17 KST (scheduled execution may be delayed by GitHub). Standard
Ubuntu runners are used, with a 20-minute deadline, one worker and one retry in CI.
No repository secrets, deployment permissions or paid runners are used. Screenshots
and traces are retained for failed attempts; the report is retained for seven
days. Successful tests do not retain browser traces. Cloudflare/Drive production
request and storage usage is unchanged by these checks.

Download `browser-qa-<run id>` from the run's Artifacts, open the HTML report or a
trace locally, and reproduce the failing test. When filing an issue, include the
run URL, failing journey, desktop/mobile project, expected/actual behavior and
reproduction steps. Check artifacts for unexpected private content before sharing.
Issues are not created automatically and this workflow has no issue-write rights.

## Codex + Playwright MCP

The repository's `.codex/config.toml` defines `smp_browser_qa`. Reopen the trusted
repository in a new Codex session to load project MCP settings. `pnpm qa:mcp`
starts the same stdio server manually. It uses an isolated headless browser,
the pinned packages, a separate output directory and only the two local origins.
It does not connect to your personal Chrome or copy authentication from it.
If a client does not load project settings, register the same wrapper with
`codex mcp add smp_browser_qa -- node /absolute/path/to/repository/scripts/qa-mcp.mjs`.
Verify it with `codex mcp get smp_browser_qa`; an already-running chat does not
automatically gain newly configured tools. The browser suite also tests the MCP
handshake, navigation and page snapshot through a separate local client.
On GitHub's Linux runner this MCP check uses the runner-installed stable Chrome
at `/opt/google/chrome/chrome`, which has Ubuntu's AppArmor policy. Chromium
sandboxing stays enabled; no host security settings are changed. Other browser
checks use the pinned Playwright Chromium download.

For interactive exploration, start `node tests/e2e/public-server.mjs` and/or
`node --import tsx tests/e2e/admin-server.mjs` in separate terminals, then ask
Codex to inspect those local URLs through the MCP server. Stop them before
`pnpm test:e2e`, which owns its own servers. Do not grant unrestricted file
access or use a production profile. Traces contain disposable local test sessions;
never adapt this recorder to a real administrator session.

References: [Playwright CI](https://playwright.dev/docs/ci-intro),
[Trace Viewer](https://playwright.dev/docs/trace-viewer),
[Playwright MCP](https://github.com/microsoft/playwright-mcp),
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
