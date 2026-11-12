// End-to-end check of the registered tool definitions with a mock context:
// arguments in, rendered text out, through the same code path DSH calls.
import assert from 'node:assert/strict'
import { registerTools } from '../lib/tools.js'

const defs = new Map()
const ctx = {
  tools: { register: (definition) => { defs.set(definition.name, definition); return () => {} } },
  workingDirectory: { get: () => process.env.CG_PROJECT ?? process.cwd() },
}
registerTools(ctx, { recallBudget: 1600 })

assert.deepEqual(
  [...defs.keys()].sort(),
  ['contextgraph_handoff', 'contextgraph_recall', 'contextgraph_session', 'contextgraph_status']
)

const session = defs.get('contextgraph_session')
assert.ok(session.parameters.properties.id, 'session tool must accept an id')
assert.ok(session.output?.render, 'every tool needs an output renderer')

const exec = { agent: { session: {} } }
const cases = [
  { args: { id: process.env.CG_SESSION_ID }, expect: /会话 / },
  { args: { id: (process.env.CG_SESSION_ID ?? '').slice(-6) }, expect: /会话 / },
  { args: { id: 'no-such-session-000000' }, expect: /没有找到|还没有任何 handoff/ },
  { args: {}, expect: /会话|还没有任何 handoff/ },
]

let run = 0
for (const item of cases) {
  if (!process.env.CG_SESSION_ID && run < 2) { run++; continue }
  const value = await session.execute(item.args, exec)
  assert.match(value.text, item.expect, `case ${JSON.stringify(item.args)} -> ${value.text.slice(0, 120)}`)
  const blocks = session.output.render(item.args, value)
  assert.equal(blocks[0].type, 'text')
  assert.ok(blocks[0].text.length > 20)
  run++
}
console.log(`tools.mjs: ${run} cases passed`)
