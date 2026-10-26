// Offline evaluation of a saved inference response against the exact sent text.
// Never calls a provider, changes a draft, or prints the source PDF text.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateAiCandidates, mergeAiFields } from '../admin-lab/ai-fields.ts'
import { extractFields } from '../admin-lab/extract.ts'
const prefix = process.argv[2], filename = process.argv[3] ?? 'report.pdf'
const payload = JSON.parse(await readFile(prefix + '-payload.json', 'utf8'))
const response = JSON.parse(await readFile(prefix + '-response.json', 'utf8'))
assert.equal(response.status, 200)
const result = response.data.result, raw = typeof result.response === 'string' ? JSON.parse(result.response) : result.response
const candidates = validateAiCandidates(raw, payload.pages)
const before = extractFields(filename, payload.pages)
const after = mergeAiFields(before, candidates, filename)
console.log(JSON.stringify({ filename, elapsedSeconds:response.elapsedSeconds, usage:result.usage,
  acceptedFields:candidates.map(c => c.field), before:before.fields, after:after.fields, warnings:after.warnings }, null, 2))
