// Smoke test against real graphs on this machine. Run with:
//   node integrations/dsh-contextgraph/tests/smoke.mjs
//
// It is intentionally not part of a test runner: the plugin ships as plain JS
// inside a project that has no JS test harness of its own.

import { assessFreshness, findGraphRoot, openGraph, readCounts } from '../lib/project.js'
import { recall } from '../lib/recall.js'
import { buildBrief } from '../lib/brief.js'

const projects = [
  '/Users/apple/FirefightingAgent',
  '/Users/apple/personal/batch-transfer-platform',
  '/Users/apple/dify-frontend',
]

for (const root of projects) {
  const found = findGraphRoot(root)
  if (!found) {
    console.log(`\n## ${root}\n  (no graph)`)
    continue
  }
  const started = Date.now()
  const db = openGraph(found)
  const freshness = assessFreshness(found, db)
  const counts = readCounts(db)
  const assessMs = Date.now() - started

  console.log(`\n## ${root}`)
  console.log(`  freshness=${freshness.state} trust=${freshness.trust} changed=${freshness.changedCount} sources=${counts.sources}`)
  console.log(`  counts nodes=${counts.nodes} edges=${counts.edges}  assess=${assessMs}ms`)

  const queryStarted = Date.now()
  const answer = recall(db, freshness, { query: '部署', budget: 1200 })
  console.log(`  recall(部署) ${answer.count} items in ${Date.now() - queryStarted}ms`)
  console.log(indent(answer.text.split('\n').slice(0, 8).join('\n')))

  const brief = buildBrief(db, freshness, { budget: 900 })
  console.log(`  brief: ${brief ? `${brief.length} chars` : 'none'}`)
  if (brief) console.log(indent(brief.split('\n').slice(0, 6).join('\n')))

  db.close()
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}
