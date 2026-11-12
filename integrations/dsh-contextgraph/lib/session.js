// Session lookup by id.
//
// Why this exists: handoff ids (`2026-11-12-141957-560-codex-a6c3a2`) leak out
// of the database all the time — they show up in commit messages, daily reports,
// and other projects' handoff docs. An agent holding one of those ids has no
// cheap way back to the record: `contextgraph query <id>` tokenizes the id and
// silently returns unrelated rules, and `external-session show` reads a
// different table. So the id is looked up here, by exact value or by prefix.

import { readMetadata } from './text.js'

const SUMMARY_MAX = 1200
const CANDIDATE_LIMIT = 12

/**
 * Find sessions by id, id prefix, or recency.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{id?: string, agent?: string, limit?: number}} options
 * @returns {{exact: object|null, matches: object[], recent: object[]}}
 */
export function findSessions(db, options) {
  const id = typeof options?.id === 'string' ? options.id.trim() : ''
  const agent = typeof options?.agent === 'string' ? options.agent.trim() : ''
  const limit = clamp(Number(options?.limit) || 10, 1, 30)

  if (!id) {
    return { exact: null, matches: [], recent: recentSessions(db, agent, limit) }
  }

  const exact = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) ?? null
  if (exact) return { exact, matches: [], recent: [] }

  // A short suffix (`a6c3a2`) or a leading timestamp (`2026-11-12-141957`) are
  // both common; `%id%` covers the first, `id%` the second, and one query
  // handles both without caring which side was truncated.
  const matches = db
    .prepare(
      `SELECT * FROM sessions
        WHERE id LIKE ? ${agent ? 'AND lower(agent) = lower(?)' : ''}
        ORDER BY started_at DESC
        LIMIT ?`
    )
    .all(`%${id}%`, ...(agent ? [agent] : []), CANDIDATE_LIMIT)

  return { exact: null, matches, recent: recentSessions(db, agent, limit) }
}

function recentSessions(db, agent, limit) {
  const sql = `SELECT * FROM sessions ${agent ? 'WHERE lower(agent) = lower(?)' : ''} ORDER BY started_at DESC LIMIT ?`
  return db.prepare(sql).all(...(agent ? [agent] : []), limit)
}

/**
 * Records a session produced: the AgentSession node plus anything else its
 * handoff wrote, all tagged with the session id in metadata.
 */
export function sessionRecords(db, sessionId) {
  try {
    return db
      .prepare(
        `SELECT type, title, content, source_id, block_id, metadata
           FROM nodes
          WHERE metadata LIKE ?
          ORDER BY CASE type WHEN 'AgentSession' THEN 0 WHEN 'File' THEN 2 ELSE 1 END, type
          LIMIT 40`
      )
      .all(`%${sessionId}%`)
  } catch {
    return []
  }
}

/**
 * @param {object|null} exact
 * @param {object[]} matches
 * @param {object[]} recent
 * @param {{id?: string, db?: import('node:sqlite').DatabaseSync}} extra
 */
export function renderSessions(exact, matches, recent, extra = {}) {
  if (exact) return renderOne(extra.db, exact)

  if (matches.length === 1) {
    return (
      `按前缀命中 1 条会话。\n\n` + renderOne(extra.db, matches[0])
    )
  }

  if (matches.length > 1) {
    const lines = [`前缀 “${extra.id}” 命中 ${matches.length} 条会话，给更长的 id 可以定位到一条：`]
    for (const row of matches) {
      lines.push(`- ${row.id}`)
      lines.push(`  ${oneLine(row.task, 70)}（${row.agent} · ${formatTime(row.started_at)}）`)
    }
    return lines.join('\n')
  }

  if (extra.id) {
    const lines = [`没有找到与 “${extra.id}” 匹配的会话。`]
    if (recent.length) {
      lines.push('', `这个库最近 ${recent.length} 条会话：`)
      for (const row of recent) lines.push(`- ${row.id}  ${oneLine(row.task, 56)}`)
      lines.push('', '提示：id 支持前缀——只给结尾的 6 位（如 a6c3a2）或开头的日期（如 2026-11-12-141957）都能匹配。')
    } else {
      lines.push('这个库里还没有任何 handoff 记录。')
    }
    return lines.join('\n')
  }

  if (!recent.length) return '这个库里还没有任何 handoff 记录（sessions 表为空）。'

  const lines = [`最近 ${recent.length} 条会话（给 id 可看详情）：`]
  for (const row of recent) {
    lines.push(`- ${row.id}`)
    lines.push(`  ${oneLine(row.task, 72)}`)
    lines.push(`  ${row.agent} · ${formatTime(row.started_at)} · ${oneLine(row.summary, 60)}`)
  }
  return lines.join('\n')
}

function renderOne(db, row) {
  const files = readFiles(row.metadata)
  const records = db ? sessionRecords(db, row.id) : []

  const lines = [
    `会话 ${row.id}`,
    `代理：${row.agent} · 开始：${formatTime(row.started_at) || '未知'}`,
  ]
  if (row.git_head) lines.push(`git HEAD：${row.git_head}`)
  lines.push(`任务：${oneLine(row.task, 200)}`)
  lines.push('', '结论：', clip(row.summary ?? '', SUMMARY_MAX))
  if (files.length) {
    lines.push('', `关联文件（${files.length}）：`)
    for (const file of files.slice(0, 12)) lines.push(`- ${file}`)
    if (files.length > 12) lines.push(`- …另有 ${files.length - 12} 个`)
  }

  const others = records.filter((r) => r.type !== 'AgentSession')
  if (others.length) {
    lines.push('', `同期写入的记忆（${others.length}）：`)
    for (const rec of others.slice(0, 8)) {
      lines.push(`- [${rec.type}] ${oneLine(rec.title, 60)}`)
    }
    if (others.length > 8) lines.push(`- …另有 ${others.length - 8} 条`)
  }

  // One specific session is the one case where the caller already knows what it
  // wants, so the summary is never trimmed to fit a budget — only the lists are.
  return lines.join('\n')
}

// Session ids encode local wall-clock time (`2026-11-12-141957`), while
// `started_at` is stored as UTC — printing the raw ISO would show 06:19 for a
// session the user knows happened at 14:19.
function formatTime(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace('T', ' ')
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function readFiles(metadata) {
  const parsed = readMetadata(metadata)
  const files = parsed?.files
  return Array.isArray(files) ? files.filter((f) => typeof f === 'string') : []
}

function oneLine(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function clip(value, max) {
  const text = String(value ?? '')
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('\n'), cut.lastIndexOf('. '))
  return `${stop > max * 0.5 ? cut.slice(0, stop + 1) : cut}…`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
