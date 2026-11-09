// Writing a session's conclusion back into the graph.
//
// The on-disk format is owned by @stardreamg/contextgraph, so this mirrors
// `recordHandoff` there: one row in `sessions`, one `AgentSession` node indexed
// for search, one `File` node per touched file, and a typed edge between them.
// Derived records (the CLI additionally classifies the summary into Rule/Test
// nodes) are intentionally not reproduced here — the classifier's regexes are
// not part of the storage contract, and guessing at them would put records in
// the graph that a later `contextgraph index` run cannot reconcile.

import { createHash } from 'node:crypto'
import path from 'node:path'
import { openGraph, gitHead } from './project.js'
import { clip, oneLine } from './text.js'

const SUMMARY_MAX = 4000
const TASK_MAX = 300
const FILES_MAX = 40

function sha256(input) {
  return createHash('sha256').update(input).digest('hex')
}

/** Same identity scheme as the indexer: sha256 of the unit-separated parts. */
function stableId(...parts) {
  return sha256(parts.join('\u001f')).slice(0, 32)
}

function formatSessionTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`
}

function slug(value) {
  return (
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '') || 'agent'
  )
}

/**
 * @param {string} root project root holding .contextgraph/graph.db
 * @param {{task: string, summary: string, agent?: string, files?: string[]}} input
 */
export function recordHandoff(root, input) {
  const task = oneLine(input.task).slice(0, TASK_MAX)
  const summary = String(input.summary ?? '').trim().slice(0, SUMMARY_MAX)
  if (!task) throw new Error('task is required')
  if (!summary) throw new Error('summary is required')

  const agent = oneLine(input.agent) || 'dsh'
  const files = normalizeFiles(input.files)
  const now = new Date()
  const timestamp = now.toISOString()
  const sessionId = `${formatSessionTimestamp(now)}-${slug(agent)}`
  const head = gitHead(root)

  const db = openGraph(root, { readOnly: false })
  try {
    db.exec('BEGIN')
    db.prepare(
      `INSERT INTO sessions (id, agent, task, summary, git_head, started_at, ended_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId,
      agent,
      task,
      summary,
      head,
      timestamp,
      timestamp,
      JSON.stringify({ files, source: 'dsh-plugin' })
    )

    const sessionNodeId = stableId('node', sessionId, 'AgentSession')
    insertNode(db, {
      id: sessionNodeId,
      type: 'AgentSession',
      title: task,
      content: summary,
      metadata: { agent, sessionId, gitHead: head, files, source: 'dsh-plugin' },
      timestamp,
    })

    for (const file of files) {
      const fileNodeId = stableId('node', sessionId, 'File', file)
      insertNode(db, {
        id: fileNodeId,
        type: 'File',
        title: file,
        content: file,
        metadata: { sessionId, path: file, filePath: file, relatedFiles: [file] },
        timestamp,
      })
      insertEdge(db, sessionNodeId, fileNodeId, 'RELATED_TO_FILE', timestamp)
    }

    db.exec('COMMIT')
    return { sessionId, agent, task, files: files.length, gitHead: head }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // the transaction may already have been rolled back by sqlite
    }
    throw error
  } finally {
    db.close()
  }
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return []
  const out = []
  for (const entry of files) {
    if (typeof entry !== 'string') continue
    const value = entry.trim().split(path.sep).join('/')
    if (!value) continue
    if (!out.includes(value)) out.push(value)
    if (out.length >= FILES_MAX) break
  }
  return out
}

function insertNode(db, node) {
  db.prepare(
    `INSERT INTO nodes (id, type, title, content, source_id, block_id, confidence, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, 1, 'confirmed', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`
  ).run(node.id, node.type, node.title, node.content, JSON.stringify(node.metadata), node.timestamp, node.timestamp)
  db.prepare('DELETE FROM nodes_fts WHERE node_id = ?').run(node.id)
  db.prepare('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)').run(
    node.id,
    node.title,
    node.content
  )
}

function insertEdge(db, fromNode, toNode, relation, timestamp) {
  db.prepare(
    `INSERT INTO edges (id, from_node, to_node, relation, confidence, metadata, created_at)
     VALUES (?, ?, ?, ?, 1, '{}', ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(stableId('edge', fromNode, relation, toNode), fromNode, toNode, relation, timestamp)
}

/** Status of a project's memory, shaped for the status tool. */
export function statusReport(db, freshness, counts) {
  return {
    project: path.basename(freshness.root ?? ''),
    root: freshness.root,
    state: freshness.state,
    trust: freshness.trust,
    summary: clip(
      `${freshness.state === 'fresh' ? '新鲜' : freshness.state === 'drift' ? 'HEAD 已变、源码未改' : '部分过期'}`,
      40
    ),
    lastIndexedAt: freshness.lastIndexedAt,
    indexedHead: short(freshness.indexedHead),
    currentHead: short(freshness.currentHead),
    changedCount: freshness.changedCount,
    missingCount: freshness.missingCount,
    changedPaths: freshness.changedPaths.slice(0, 20),
    sources: counts.sources,
    blocks: counts.blocks,
    nodes: counts.nodes,
    edges: counts.edges,
    failedBlocks: freshness.failedBlocks,
  }
}

function short(value) {
  return typeof value === 'string' && value.length > 8 ? value.slice(0, 8) : value
}
