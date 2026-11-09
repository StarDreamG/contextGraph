// Turning a graph into a small, ranked answer.
//
// Three deliberate departures from the CLI query path:
//
//   1. No graph expansion. `co_occurs_with` is emitted for every node pair in a
//      block, so expanding along it pulls in arbitrary siblings — one project in
//      this workspace has 70k such edges. Only typed, meaningful edges are
//      followed (RELATED_TO_FILE / APPLIES_TO / REQUIRES_TEST).
//   2. LIKE first, FTS second. The graph is FTS5 with the `unicode61`
//      tokenizer, which cannot segment Chinese: a CJK query mostly matches
//      nothing. Substring matching over a few thousand rows is a few dozen
//      milliseconds and actually works.
//   3. A character budget. An answer is capped by the caller, ranked by how
//      much a record is worth, and deduplicated per source block.

import path from 'node:path'
import { clip, likePattern, oneLine, queryTerms, readMetadata } from './text.js'
import { describeFreshness } from './project.js'
import { factDensity, isNoiseRecord, lengthPreference, looksLikeDataFile, looksLikeWeakSource } from './quality.js'

const TYPE_WEIGHT = {
  Rule: 12,
  Test: 8,
  Failure: 7,
  Fix: 7,
  Decision: 6,
  Environment: 6,
  Command: 5,
  Workflow: 3,
  Preference: 3,
  AgentSession: 2,
  Note: 1,
  File: 0,
}

const TYPE_LABEL = {
  Rule: '规则',
  Test: '测试',
  Failure: '故障',
  Fix: '修复',
  Decision: '决策',
  Environment: '环境',
  Command: '命令',
  Workflow: '流程',
  Preference: '偏好',
  AgentSession: '会话',
  Note: '笔记',
  File: '文件',
}

const PRIORITY_WEIGHT = { P0: 10, P1: 5, P2: 2, P3: 0, P4: -8 }

const RECORD_BODY_MAX = 240
const CANDIDATE_LIMIT = 240
const MAX_FILE_ANCHORS = 24

const SELECT_FIELDS = `
  n.id, n.type, n.title, n.content, n.status, n.metadata,
  n.block_id AS blockId,
  b.path AS blockPath, b.start_line AS startLine, b.end_line AS endLine
`

const FROM_NODES = `
  FROM nodes n LEFT JOIN blocks b ON b.id = n.block_id
`

/**
 * Rank records for a free-text query, a file, or a module.
 *
 * @param {object} db open graph handle
 * @param {object} freshness result of assessFreshness()
 * @param {{query?: string, file?: string, module?: string, limit?: number, budget?: number}} options
 */
export function recall(db, freshness, options = {}) {
  const budget = Number.isFinite(options.budget) ? options.budget : 1600
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(options.limit, 20)) : 8
  const query = typeof options.query === 'string' ? options.query.trim() : ''
  const file = typeof options.file === 'string' ? options.file.trim() : ''
  const module = typeof options.module === 'string' ? options.module.trim() : ''

  const terms = queryTerms([query, module].filter(Boolean).join(' '))
  const changedPaths = new Set(freshness?.changedPaths ?? [])
  const collected = []
  const what = []

  if (file) {
    what.push(`文件 ${path.basename(file) || file}`)
    collected.push(...fileCandidates(db, file))
  }
  if (query) what.push(`“${query}”`)
  if (module) what.push(`模块 ${module}`)

  if (terms.length > 0) collected.push(...textCandidates(db, terms))
  if (collected.length === 0 && (query || module || file)) {
    // The terms found nothing; fall back to the standing high-value set so an
    // empty answer still tells the agent something useful exists.
    collected.push(...highValueCandidates(db, 80))
  }
  if (!query && !file && !module) collected.push(...highValueCandidates(db, CANDIDATE_LIMIT))

  // JSON exports, scraped policy files and markdown headings all live in the
  // graph as `Rule`/`Note`; they match a query but answer nothing.
  const usable = collected.filter((candidate) => candidate.type === 'File' || !isNoiseRecord(candidate))
  const ranked = rank(usable, { terms, changedPaths, module })
  const picked = diversify(dedupe(ranked), limit)

  const header = buildHeader(freshness, what)
  if (picked.length === 0) {
    return {
      text: `${header}\n没有匹配的记录。可以换个说法，或用 file 参数指向具体文件。`,
      count: 0,
      items: [],
    }
  }

  const lines = [header]
  let used = header.length
  let shown = 0
  for (const item of picked) {
    const block = renderItem(item, shown + 1)
    if (used + block.length > budget && shown > 0) break
    lines.push(block)
    used += block.length
    shown += 1
  }
  if (shown < picked.length) {
    lines.push(`…另有 ${picked.length - shown} 条未展开（增大 limit 或用 budget 控制预算）`)
  }

  return {
    text: lines.join('\n'),
    count: shown,
    items: picked.slice(0, shown).map(publicItem),
  }
}

function buildHeader(freshness, what) {
  const project = freshness?.root ? path.basename(freshness.root) : '未知项目'
  const parts = [`ContextGraph · ${project}`]
  if (what.length > 0) parts.push(`检索：${what.join(' + ')}`)
  parts.push(describeFreshness(freshness ?? {}))
  return parts.join(' · ')
}

function renderItem(item, index) {
  const priority = item.priority && item.priority !== 'P3' ? ` ${item.priority}` : ''
  const type = `${TYPE_LABEL[item.type] ?? item.type}${priority}`
  const stale = item.stale ? '（所在文件已改动）' : ''
  const origin = sourceRef(item)
  const content = clip(item.content, RECORD_BODY_MAX)
  const body = content && content !== oneLine(item.title) ? `\n    ${content}` : ''
  return `[${index}] ${type} ${clip(item.title, 80)}${stale}${origin ? `\n    ${origin}` : ''}${body}`
}

function sourceRef(item) {
  if (item.blockPath) {
    const span = item.startLine ? `:${item.startLine}${item.endLine && item.endLine !== item.startLine ? `-${item.endLine}` : ''}` : ''
    return `来源 ${item.blockPath}${span}`
  }
  const sessionId = item.metadata?.sessionId
  return sessionId ? `来源 会话 ${sessionId}` : ''
}

function publicItem(item) {
  return {
    type: item.type,
    title: oneLine(item.title).slice(0, 160),
    content: oneLine(item.content).slice(0, 400),
    priority: item.priority ?? null,
    source: item.blockPath ?? item.metadata?.sessionId ?? null,
    stale: Boolean(item.stale),
    score: Math.round(item.score * 10) / 10,
  }
}

// ---------------------------------------------------------------- candidates

function textCandidates(db, terms) {
  const conditions = terms
    .map(() => `(n.title LIKE ? ESCAPE '\\' OR n.content LIKE ? ESCAPE '\\')`)
    .join(' OR ')
  const params = []
  for (const term of terms) {
    const pattern = likePattern(term)
    params.push(pattern, pattern)
  }
  try {
    return db
      .prepare(`SELECT ${SELECT_FIELDS} ${FROM_NODES} WHERE n.type <> 'File' AND (${conditions}) LIMIT ?`)
      .all(...params, CANDIDATE_LIMIT)
      .map(toCandidate('query'))
  } catch {
    return []
  }
}

function highValueCandidates(db, limit) {
  try {
    return db
      .prepare(
        `SELECT ${SELECT_FIELDS} ${FROM_NODES}
         WHERE n.type IN ('Rule','Test','Environment','Decision','Failure','Fix','Command')
         ORDER BY n.updated_at DESC LIMIT ?`
      )
      .all(limit)
      .map(toCandidate('standing'))
  } catch {
    return []
  }
}

function fileCandidates(db, file) {
  const normalized = file.split(path.sep).join('/')
  const patterns = new Set([likePattern(normalized)])
  const base = path.posix.basename(normalized)
  if (base && base !== normalized) patterns.add(likePattern(base))

  const out = []

  // The most direct answer to "what should I know before editing this file" is
  // the block that was extracted from it, not a record that merely links to it.
  for (const pattern of patterns) {
    try {
      out.push(
        ...db
          .prepare(`SELECT ${SELECT_FIELDS} ${FROM_NODES} WHERE b.path LIKE ? ESCAPE '\\' LIMIT ?`)
          .all(pattern, CANDIDATE_LIMIT)
          .map(toCandidate('file'))
      )
    } catch {
      // a graph without blocks simply yields nothing extra
    }
  }

  const anchors = []
  for (const pattern of patterns) {
    try {
      anchors.push(
        ...db
          .prepare(
            `SELECT id, title FROM nodes
             WHERE type = 'File' AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
             LIMIT ?`
          )
          .all(pattern, pattern, MAX_FILE_ANCHORS)
      )
    } catch {
      // A graph without File nodes simply yields no file anchors.
    }
    if (anchors.length > 0) break
  }
  if (anchors.length === 0) return out

  const ids = [...new Set(anchors.map((row) => row.id))].slice(0, MAX_FILE_ANCHORS)
  const placeholders = ids.map(() => '?').join(',')

  // Records that were recorded against this file: rules, environment facts,
  // decisions. The edge points from the record to the File node.
  try {
    out.push(
      ...db
        .prepare(
          `SELECT ${SELECT_FIELDS} FROM edges e
           JOIN nodes n ON n.id = e.from_node
           LEFT JOIN blocks b ON b.id = n.block_id
           WHERE e.to_node IN (${placeholders})
             AND e.relation IN ('RELATED_TO_FILE','APPLIES_TO')
           LIMIT ?`
        )
        .all(...ids, CANDIDATE_LIMIT)
        .map(toCandidate('file'))
    )
  } catch {
    // ignore a graph whose edges table predates this relation
  }

  // Tests this file requires. The edge points from the File node to the test.
  try {
    out.push(
      ...db
        .prepare(
          `SELECT ${SELECT_FIELDS} FROM edges e
           JOIN nodes n ON n.id = e.to_node
           LEFT JOIN blocks b ON b.id = n.block_id
           WHERE e.from_node IN (${placeholders}) AND e.relation = 'REQUIRES_TEST'
           LIMIT ?`
        )
        .all(...ids, CANDIDATE_LIMIT)
        .map(toCandidate('file'))
    )
  } catch {
    // ignore
  }

  // The File records themselves are weak, but they confirm the path resolved.
  for (const anchor of anchors.slice(0, 3)) {
    out.push(
      ...db
        .prepare(`SELECT ${SELECT_FIELDS} ${FROM_NODES} WHERE n.id = ? LIMIT 1`)
        .all(anchor.id)
        .map(toCandidate('file'))
    )
  }
  return out
}

function toCandidate(source) {
  return (row) => {
    const metadata = readMetadata(row.metadata)
    return {
      id: row.id,
      type: row.type,
      title: row.title ?? '',
      content: row.content ?? '',
      status: row.status ?? 'confirmed',
      metadata,
      priority: metadata.priority ?? null,
      blockId: row.blockId ?? null,
      blockPath: row.blockPath ?? null,
      startLine: row.startLine ?? null,
      endLine: row.endLine ?? null,
      source,
      score: 0,
      stale: false,
    }
  }
}

// ------------------------------------------------------------------- ranking

function rank(candidates, context) {
  const scored = candidates.map((candidate) => {
    candidate.score = scoreCandidate(candidate, context)
    return candidate
  })
  scored.sort((left, right) => right.score - left.score)
  return scored
}

function scoreCandidate(candidate, { terms, changedPaths, module }) {
  let score = TYPE_WEIGHT[candidate.type] ?? 1
  score += PRIORITY_WEIGHT[candidate.priority] ?? 0

  const title = candidate.title ?? ''
  const body = candidate.content ?? ''
  for (const term of terms) {
    const weight = Math.min(term.length, 8)
    if (title.includes(term)) score += 3 + weight * 0.6
    else if (body.includes(term)) score += 1 + weight * 0.25
  }

  if (candidate.source === 'file') score += 5
  if (candidate.status === 'candidate') score -= 2

  // Prefer statements a reader can act on over long prose that merely mentions
  // the terms.
  const text = `${title} ${body}`
  score += factDensity(text) * 0.9
  score += lengthPreference(body.length) * 0.7
  if (looksLikeDataFile(candidate.blockPath)) score -= 12
  if (looksLikeWeakSource(candidate.blockPath)) score -= 4

  if (module) {
    const modules = candidate.metadata?.modules
    if (Array.isArray(modules) && modules.some((item) => String(item).includes(module))) score += 4
  }

  // A record that came from a file edited since the index is still worth
  // showing — just not ahead of records from untouched files.
  if (candidate.blockPath && changedPaths.has(candidate.blockPath)) {
    candidate.stale = true
    score -= 3
  }

  return Math.max(score, 0.1)
}

/** Keep the best record per (block, type); a block's rule and its test survive. */
function dedupe(candidates) {
  const best = new Map()
  for (const candidate of candidates) {
    const key = `${candidate.blockId ?? candidate.id}|${candidate.type}`
    const current = best.get(key)
    if (!current || candidate.score > current.score) best.set(key, candidate)
  }
  return [...best.values()].sort((left, right) => right.score - left.score)
}

/**
 * Cap how much of one answer comes from a single file. Three sections of the
 * same design document crowd out the environment fact recorded elsewhere.
 */
function diversify(candidates, limit) {
  const out = []
  const perPath = new Map()
  for (const candidate of candidates) {
    const key = candidate.blockPath ?? `(session:${candidate.metadata?.sessionId ?? candidate.id})`
    const used = perPath.get(key) ?? 0
    if (used >= 2) continue
    perPath.set(key, used + 1)
    out.push(candidate)
    if (out.length >= limit) return out
  }
  return out
}
