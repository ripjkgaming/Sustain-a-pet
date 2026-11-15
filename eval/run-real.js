// On-demand real-model eval. Run: OPENROUTER_API_KEY=... npm run eval:real
// Calls generateQuest from api/eco-quest.js for each case, scores with the deterministic checks in eval/checks.js,
// and writes measured counts to eval/results/latest.json. Nothing here is a claimed result: every number is counted at run time.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateQuest, modelChain } from '../api/eco-quest.js'
import { runChecks } from './checks.js'
import { loadCases, questArgs } from './harness.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 4000)
const CASE_TIMEOUT_MS = Number(process.env.EVAL_CASE_TIMEOUT_MS ?? 45000)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!process.env.OPENROUTER_API_KEY) {
  console.log('not run: no credentials (set OPENROUTER_API_KEY to run the real-model eval). No results file written.')
  process.exit(0)
}

// Cases whose scripted failure mode cannot be forced against a live model are mock-only.
const cases = loadCases().filter((c) => c.realRun !== false)
const env = { ...process.env, QUEST_SIGNING_SECRET: process.env.QUEST_SIGNING_SECRET || 'eval-run-signing-secret-1234' }
const results = []

for (const [index, testCase] of cases.entries()) {
  if (index > 0) await sleep(DELAY_MS)
  const started = Date.now()
  let result
  let error = null
  try {
    result = await generateQuest({ ...questArgs(testCase), env, timeoutMs: CASE_TIMEOUT_MS })
  } catch (err) {
    error = err?.name || 'Error'
    result = { status: 0, body: {} }
  }
  const checks = runChecks(testCase, result)
  const body = result.body
  const entry = {
    id: testCase.id,
    category: testCase.category,
    status: result.status,
    kind: body.kind ?? null,
    live: body.live ?? null,
    fallback: Boolean(body.fallback),
    fallbackReason: body.fallback_reason ?? null,
    model: body.model ?? null,
    confidence: body.quest?.confidence ?? null,
    questCategory: body.quest?.category ?? null,
    reward: body.quest?.reward ?? null,
    checks,
    passed: checks.length > 0 && checks.every((c) => c.pass),
    ms: Date.now() - started,
    ...(error ? { error } : {}),
  }
  results.push(entry)
  const failed = checks.filter((c) => !c.pass).map((c) => c.name)
  console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${entry.id} [${entry.live ? 'live' : entry.fallback ? 'fallback' : 'n/a'}]${failed.length ? ` failed: ${failed.join(', ')}` : ''}`)
}

const liveResults = results.filter((r) => r.live === true)
const checkTotals = {}
for (const r of results) {
  for (const c of r.checks) {
    checkTotals[c.name] ??= { passed: 0, failed: 0 }
    checkTotals[c.name][c.pass ? 'passed' : 'failed'] += 1
  }
}
const summary = {
  date: new Date().toISOString(),
  modelChain: modelChain(env),
  modelsThatAnswered: [...new Set(results.map((r) => r.model).filter(Boolean))],
  delayMs: DELAY_MS,
  caseTimeoutMs: CASE_TIMEOUT_MS,
  counts: {
    cases: results.length,
    casesPassedAllChecks: results.filter((r) => r.passed).length,
    casesFailed: results.filter((r) => !r.passed).length,
    liveResponses: liveResults.length,
    fallbackResponses: results.filter((r) => r.fallback).length,
    liveCasesPassedAllChecks: liveResults.filter((r) => r.passed).length,
  },
  checkTotals,
  note: 'Counts are measured in this run only. Fallback responses are prerecorded tips and do not measure the model.',
  results,
}

mkdirSync(join(DIR, 'results'), { recursive: true })
writeFileSync(join(DIR, 'results', 'latest.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(`\n${JSON.stringify(summary.counts)}\nwrote eval/results/latest.json`)
