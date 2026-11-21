// Small stdio MCP handshake/navigation check. Run while the local public QA
// server is running. It verifies the configured tool, not just its npm install.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
const child = spawn(process.execPath, ['scripts/qa-mcp.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] })
const pending = new Map()
let sequence = 0, stderr = ''
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
const lines = createInterface({ input: child.stdout })
const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
lines.on('line', line => {
  const message = JSON.parse(line)
  if (message.method === 'roots/list') return send({ id: message.id, result: { roots: [] } })
  const operation = pending.get(message.id)
  if (operation) { pending.delete(message.id); clearTimeout(operation.timer); message.error ? operation.reject(Error(JSON.stringify(message.error))) : operation.resolve(message.result) }
})
function call(method, params) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`MCP timeout: ${method}\n${stderr}`)) }, 25_000)
    pending.set(id, { resolve, reject, timer }); send({ id, method, params })
  })
}
try {
  const info = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smp-local-qa', version: '1' } })
  send({ method: 'notifications/initialized' })
  const available = await call('tools/list', {})
  assert.ok(available.tools.some(tool => tool.name === 'browser_navigate'))
  const navigation = await call('tools/call', { name: 'browser_navigate', arguments: { url: 'http://127.0.0.1:3005/research' } })
  assert.ok(!navigation.isError, JSON.stringify(navigation))
  const snapshot = await call('tools/call', { name: 'browser_snapshot', arguments: {} })
  assert.ok(!snapshot.isError)
  assert.match(JSON.stringify(snapshot), /RESEARCH|리포트/)
  console.log(JSON.stringify({ server: info.serverInfo, tools: available.tools.length, localNavigation: 'passed', snapshot: 'passed' }))
  await call('tools/call', { name: 'browser_close', arguments: {} })
} finally { lines.close(); child.stdin.end(); child.kill('SIGTERM') }
