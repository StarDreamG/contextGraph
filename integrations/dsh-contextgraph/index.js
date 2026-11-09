// DSH binding for ContextGraph.
//
// The plugin is read-only with respect to the index: it never scans sources,
// never rewrites `status`, and never expands the graph. It opens the existing
// `.contextgraph/graph.db` of the project the agent is working in, answers from
// it, and writes back only when the agent explicitly records a handoff.
//
// That keeps it safe to enable globally — a project without a graph produces no
// tools firing, no injected context, and no errors.

import { randomUUID } from 'node:crypto'
import { assessFreshness, findGraphRoot, openGraph } from './lib/project.js'
import { buildBrief } from './lib/brief.js'
import { registerTools } from './lib/tools.js'

/** Services this plugin needs before `apply` runs. */
export const inject = ['tools', 'workingDirectory']

const DEFAULTS = {
  autoBrief: true,
  briefBudget: 900,
  recallBudget: 1600,
}

/** Suppress a repeat brief for the same session within this window. */
const REPEAT_WINDOW_MS = 10 * 60 * 1000
/** workspace|session -> { hash, at } */
const injected = new Map()

/**
 * @param {object} ctx cordis plugin context
 * @param {{autoBrief?: boolean, briefBudget?: number, recallBudget?: number}} config
 */
export function apply(ctx, config) {
  const settings = { ...DEFAULTS, ...(config ?? {}) }
  registerTools(ctx, {
    recallBudget: positive(settings.recallBudget, DEFAULTS.recallBudget),
  })
  if (settings.autoBrief === false) return

  ctx.on('agent/created', async (payload) => {
    await injectBrief(ctx, payload, positive(settings.briefBudget, DEFAULTS.briefBudget))
  })
}

async function injectBrief(ctx, payload, budget) {
  const agent = payload?.agent
  if (!agent) return

  let cwd
  try {
    cwd = ctx.workingDirectory.get(agent.session)
  } catch {
    return
  }
  const root = cwd ? findGraphRoot(cwd) : null
  if (!root) return

  let db
  try {
    db = openGraph(root)
    const freshness = assessFreshness(root, db)
    const text = buildBrief(db, freshness, { budget })
    if (!text) return

    const key = `${root}|${sessionIdOf(agent)}`
    const last = injected.get(key)
    const now = Date.now()
    if (last && last.hash === hashOf(text) && now - last.at < REPEAT_WINDOW_MS) return

    await agent.inject({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'system-prompt' },
    })
    injected.set(key, { hash: hashOf(text), at: now })
  } catch (error) {
    // Injected memory is an optimisation: a broken or locked graph must never
    // stop an agent from starting.
    try {
      ctx.logger?.warn?.(`[contextgraph] brief skipped: ${error instanceof Error ? error.message : error}`)
    } catch {
      // logging is best-effort too
    }
  } finally {
    try {
      db?.close()
    } catch {
      // already closed
    }
  }
}

function sessionIdOf(agent) {
  try {
    return agent.session?.id ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function hashOf(text) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0
  }
  return hash
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}
