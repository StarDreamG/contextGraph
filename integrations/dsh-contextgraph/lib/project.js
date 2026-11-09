// Locating a project's ContextGraph database and judging how much of it can be
// trusted right now.
//
// The freshness rule here is the plugin's main disagreement with the CLI. The
// CLI marks the whole graph `Stale`/`Low` as soon as `git HEAD` moves or any
// tracked file differs from its indexed hash. In practice a week-old graph is
// still worth reading: a branch switch, a merge, or one edited file does not
// invalidate the deployment facts and test commands recorded months ago.
//
//   fresh   HEAD matches and no source file changed since the index  -> high
//   drift   HEAD moved but no source file changed (branch, merge, rebase) -> high
//   stale   some source files changed -> medium, and the changed paths are
//           reported so the caller can discount records that came from them
//   none    the project was never indexed

import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const FRESHNESS_TTL_MS = 45_000
const MAX_WALK_UP = 12

/** root -> { at, value } */
const freshnessCache = new Map()

/**
 * Walk up from `startDir` to the first directory holding a ContextGraph graph.
 * @returns {string | null} the project root, or null when this tree has none.
 */
export function findGraphRoot(startDir) {
  if (!startDir) return null
  let current = path.resolve(startDir)
  for (let depth = 0; depth < MAX_WALK_UP; depth += 1) {
    if (existsSync(path.join(current, '.contextgraph', 'graph.db'))) return current
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  // `.worktrees/<name>` checkouts live under a project that owns the graph.
  return null
}

/** Open the graph read-only; callers must close it. */
export function openGraph(root, { readOnly = true } = {}) {
  const file = path.join(root, '.contextgraph', 'graph.db')
  return new DatabaseSync(file, { readOnly })
}

/** Read one JSON-encoded value out of the `status` key/value table. */
export function readStatus(db, key, fallback) {
  let row
  try {
    row = db.prepare('SELECT value FROM status WHERE key = ?').get(key)
  } catch {
    return fallback
  }
  if (!row) return fallback
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value ?? fallback
  }
}

/** Current commit, or null outside a repository. */
export function gitHead(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() || null
  } catch {
    return null
  }
}

function countRows(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
  } catch {
    return 0
  }
}

/** Row counts cheap enough to show in a status answer. */
export function readCounts(db) {
  return {
    sources: countRows(db, 'sources'),
    blocks: countRows(db, 'blocks'),
    nodes: countRows(db, 'nodes'),
    edges: countRows(db, 'edges'),
  }
}

/**
 * The indexer records the abbreviated sha while `git rev-parse HEAD` prints the
 * full one, so a plain `===` always reports drift. Compare by prefix, with a
 * floor that keeps a stray short value from matching everything.
 */
export function headMatches(currentHead, indexedHead) {
  if (!currentHead || !indexedHead) return false
  if (currentHead === indexedHead) return true
  const shorter = currentHead.length < indexedHead.length ? currentHead : indexedHead
  const longer = shorter === currentHead ? indexedHead : currentHead
  return shorter.length >= 7 && longer.startsWith(shorter)
}

/**
 * Assess graph freshness without re-reading file contents.
 *
 * Only `stat` is used for the per-source comparison, so a project with five
 * thousand sources costs a few dozen milliseconds, and the result is cached for
 * {@link FRESHNESS_TTL_MS}.
 */
export function assessFreshness(root, db, { force = false } = {}) {
  const now = Date.now()
  if (!force) {
    const cached = freshnessCache.get(root)
    if (cached && now - cached.at < FRESHNESS_TTL_MS) return cached.value
  }

  const indexedHead = readStatus(db, 'indexedGitHead', null)
  const lastIndexedAt = readStatus(db, 'lastIndexedAt', null)
  const failedBlocks = readStatus(db, 'failedBlocks', 0) ?? 0
  const currentHead = gitHead(root)
  const indexedAtMs = lastIndexedAt ? Date.parse(lastIndexedAt) : Number.NaN

  let sources = []
  try {
    sources = db.prepare('SELECT path FROM sources').all()
  } catch {
    sources = []
  }

  const changed = []
  let missing = 0
  if (Number.isFinite(indexedAtMs) && indexedAtMs > 0) {
    for (const row of sources) {
      const absolute = path.isAbsolute(row.path) ? row.path : path.join(root, row.path)
      try {
        // One second of slack absorbs the gap between the indexer reading its
        // clock and the filesystem settling the mtime of files it just read.
        if (statSync(absolute).mtimeMs > indexedAtMs + 1000) changed.push(row.path)
      } catch {
        missing += 1
      }
    }
  }

  let state
  if (!Number.isFinite(indexedAtMs) || indexedAtMs <= 0) state = 'none'
  else if (changed.length === 0 && missing === 0) state = headMatches(currentHead, indexedHead) ? 'fresh' : 'drift'
  else state = 'stale'

  // Drift is not decay: the recorded knowledge still describes this code.
  let trust
  if (state === 'none') trust = 'unknown'
  else if (state === 'fresh' || state === 'drift') trust = failedBlocks > 0 ? 'medium' : 'high'
  else {
    const ratio = sources.length > 0 ? (changed.length + missing) / sources.length : 1
    trust = ratio < 0.15 ? 'medium' : 'low'
  }

  const value = {
    state,
    trust,
    root,
    indexedHead,
    currentHead,
    headMatches: headMatches(currentHead, indexedHead),
    lastIndexedAt,
    failedBlocks,
    sourceCount: sources.length,
    changedCount: changed.length,
    missingCount: missing,
    changedPaths: changed,
    assessedAt: new Date(now).toISOString(),
  }
  freshnessCache.set(root, { at: now, value })
  return value
}

/** Drop the cached verdict, e.g. right after this plugin wrote a handoff. */
export function invalidateFreshness(root) {
  freshnessCache.delete(root)
}

/** One short human-readable clause describing freshness. */
export function describeFreshness(freshness) {
  const { state, changedCount, missingCount, lastIndexedAt } = freshness
  const when = lastIndexedAt ? relativeTime(lastIndexedAt) : '未知时间'
  if (state === 'fresh') return `新鲜（${when}索引）`
  if (state === 'drift') return `可用：HEAD 已变但源码未改（${when}索引）`
  if (state === 'stale') {
    const extra = missingCount > 0 ? `，另 ${missingCount} 个文件缺失` : ''
    return `部分过期：${changedCount} 个文件在索引后改动${extra}（${when}索引）`
  }
  return '未索引'
}

/** Compact relative time such as `3 天前`. */
export function relativeTime(iso) {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return '未知'
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 90) return '刚刚'
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 45) return `${days} 天前`
  const months = Math.round(days / 30)
  return `${months} 个月前`
}
