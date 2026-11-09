// The brief injected when an agent is created.
//
// It answers one question — "what does this project want me to know before I
// touch anything?" — in under a thousand characters. Nothing here is a verbatim
// dump: rules dominate, commands and environment facts follow, and every line
// keeps a source reference so the agent can go read the original when it
// matters.
//
// Ranking is fact-density first, recency second. The graph is full of long plan
// documents that were classified as `Rule`; they are true records, but a
// deployment address is worth more in the first thousand characters than the
// preamble of a design doc. Records are also spread across files, so one
// document cannot fill the whole brief.

import path from 'node:path'
import { clip, oneLine, readMetadata } from './text.js'
import { describeFreshness } from './project.js'
import { factDensity, isNoiseRecord, lengthPreference, looksLikeVendored, looksLikeWeakSource } from './quality.js'

const TITLE_MAX = 56
const BODY_MAX = 96
const RULE_MAX = 4
const TEST_MAX = 3
const ENV_MAX = 3

const PRIORITY_RANK = { P0: 100, P1: 60, P2: 20, P3: 0, P4: -40 }

/**
 * Build the injected text, or null when the project has no usable memory.
 *
 * @param {object} db
 * @param {object} freshness
 * @param {{budget?: number}} options
 */
export function buildBrief(db, freshness, options = {}) {
  if (!freshness || freshness.state === 'none') return null
  const budget = Number.isFinite(options.budget) ? options.budget : 900
  const project = path.basename(freshness.root ?? '')

  const pool = candidatePool(db, ['Rule', 'Test', 'Command', 'Environment', 'Decision', 'Failure', 'Fix'])
  const ranked = rank(pool)

  const rules = diversify(ranked.filter((node) => node.type === 'Rule'), RULE_MAX)
  const tests = diversify(ranked.filter((node) => node.type === 'Test' || node.type === 'Command'), TEST_MAX)
  const envs = diversify(ranked.filter((node) => node.type === 'Environment'), ENV_MAX)
  const fallback = diversify(
    ranked.filter((node) => ['Decision', 'Failure', 'Fix'].includes(node.type)),
    2
  )

  const usedPaths = new Set()
  const pushed = []
  const head = [
    `<contextgraph-memory project="${escapeAttribute(project)}">`,
    `这份项目记忆来自 .contextgraph（${describeFreshness(freshness)}）。`,
  ]

  const lines = [...head]
  let used = lines.join('\n').length

  const push = (header, items) => {
    const fresh = items.filter((item) => {
      const key = item.blockPath ?? item.title
      if (usedPaths.has(key)) return false
      // The same deployment fact often appears in both a handoff doc and the
      // README; quoting it twice spends budget without adding information.
      if (pushed.some((other) => similarity(other.content, item.content) > 0.72)) return false
      usedPaths.add(key)
      pushed.push(item)
      return true
    })
    if (fresh.length === 0) return
    const rendered = fresh.map((item) => `• ${renderLine(item)}`)
    const block = [header, ...rendered].join('\n')
    if (used + block.length > budget) {
      const room = budget - used - header.length - 1
      const first = rendered[0]
      if (room < 80 || !first || first.length > room) return
      lines.push(header, first)
      used += header.length + first.length + 1
      return
    }
    lines.push(header, ...rendered)
    used += block.length
  }

  push('必守规则：', rules)
  push('常用测试/命令：', tests)
  push('环境要点：', envs)
  if (rules.length === 0 && tests.length === 0) push('过往经验：', fallback)

  if (used <= head.join('\n').length) return null

  lines.push('细节可用 contextgraph_recall 检索（可按 file/module）；本次结论用 contextgraph_handoff 写回。')
  lines.push('</contextgraph-memory>')
  return lines.join('\n')
}

/** One query per type so a large `Test` population cannot crowd out `Rule`. */
function candidatePool(db, types) {
  const rows = []
  for (const type of types) {
    try {
      rows.push(
        ...db
          .prepare(
            `SELECT n.id, n.type, n.title, n.content, n.metadata,
                    b.path AS blockPath, b.start_line AS startLine
             FROM nodes n LEFT JOIN blocks b ON b.id = n.block_id
             WHERE n.type = ? AND n.status <> 'candidate'
             ORDER BY n.updated_at DESC
             LIMIT 800`
          )
          .all(type)
      )
    } catch {
      // a graph without this type is not an error
    }
  }
  return rows
    .map((row) => {
      const metadata = readMetadata(row.metadata)
      return {
        type: row.type,
        title: oneLine(row.title),
        content: oneLine(row.content),
        metadata,
        priority: metadata.priority ?? null,
        blockPath: row.blockPath ?? null,
        startLine: row.startLine ?? null,
      }
    })
    .filter((node) => !isNoiseRecord(node))
}

function rank(nodes) {
  const scored = nodes.map((node) => {
    node.score = score(node)
    return node
  })
  scored.sort((left, right) => right.score - left.score)
  return scored
}

function score(node) {
  let value = PRIORITY_RANK[node.priority] ?? 0
  value += factDensity(`${node.title} ${node.content}`) * 1.8
  value += lengthPreference(node.content.length)
  if (node.type === 'Test' || node.type === 'Command') value += 8
  if (node.type === 'Environment') value += 6
  if (looksLikeWeakSource(node.blockPath)) value -= 8
  if (looksLikeVendored(node.blockPath)) value -= 25
  // A record whose title already says where it applies is more useful than a
  // generic one, because the reader can verify it in one step.
  if (node.blockPath && node.title.length <= 40) value += 1
  return value
}

/**
 * Spread picks across files: the first pass takes at most one record per
 * source, a second pass fills the remainder from files already seen. A brief
 * built from three sections of the same design doc is a table of contents, not
 * a briefing.
 */
function diversify(nodes, limit) {
  const out = []
  const perPath = new Map()
  for (const node of nodes) {
    const key = node.blockPath ?? '(session)'
    const used = perPath.get(key) ?? 0
    if (used >= 1) continue
    perPath.set(key, used + 1)
    out.push(node)
    if (out.length >= limit) return out
  }
  for (const node of nodes) {
    const key = node.blockPath ?? '(session)'
    const used = perPath.get(key) ?? 0
    if (used >= 2) continue
    if (out.includes(node)) continue
    perPath.set(key, used + 1)
    out.push(node)
    if (out.length >= limit) return out
  }
  return out
}

function renderLine(node) {
  const priority = node.priority && node.priority !== 'P3' && node.priority !== 'P4' ? `${node.priority} ` : ''
  const title = clip(node.title, TITLE_MAX)
  const body = node.content && node.content !== node.title ? clip(node.content, BODY_MAX) : ''
  const where = node.blockPath
    ? `（${node.blockPath}${node.startLine ? `:${node.startLine}` : ''}）`
    : ''
  return body ? `${priority}${title} — ${body}${where}` : `${priority}${title}${where}`
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/["<>&]/g, (char) => `&#${char.charCodeAt(0)};`)
}

/**
 * Dice-style overlap over character bigrams of the opening of each record.
 *
 * Comparing whole bodies would fail on long plans that share only a preamble;
 * comparing titles would miss the case this exists for — two records titled
 * differently that both state the same deployment address.
 */
function similarity(left, right) {
  const grams = (text) => {
    const source = String(text ?? '').slice(0, 120)
    const out = new Set()
    for (let index = 0; index < source.length - 1; index += 1) out.add(source.slice(index, index + 2))
    return out
  }
  const a = grams(left)
  const b = grams(right)
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared += 1
  return shared / Math.min(a.size, b.size)
}
