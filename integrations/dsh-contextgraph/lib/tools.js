// The three tools this plugin adds.
//
// Descriptions matter more than implementations here: a tool the model cannot
// tell apart from `grep` never gets called. Each one states the question it
// answers, when to prefer it over reading files, and what it returns.

import { assessFreshness, describeFreshness, findGraphRoot, openGraph, readCounts, relativeTime } from './project.js'
import { recall } from './recall.js'
import { recordHandoff } from './handoff.js'
import { findSessions, renderSessions } from './session.js'

const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Human- and model-readable answer.' },
      count: { type: 'number', description: 'Number of records included.' },
    },
    required: ['text'],
    additionalProperties: true,
  },
  render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
}

const RECALL_PARAMETERS = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: '自由文本问题或关键词，例如 “部署目录在哪” / “为什么 CI 会挂”。支持中文子串匹配。',
    },
    file: {
      type: 'string',
      description: '要修改或已经修改的文件路径（相对于项目根即可）。返回与该文件关联的规则、环境事实和必须运行的测试。',
    },
    module: {
      type: 'string',
      description: '模块/子系统名，例如 “鉴权” “sso” “支付”。',
    },
    limit: {
      type: 'number',
      description: '最多返回多少条记录，默认 8，上限 20。',
    },
  },
  additionalProperties: false,
}

const HANDOFF_PARAMETERS = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      description: '这次会话在做什么，一句话，例如 “修复 4A 单点登录回调 502”。',
    },
    summary: {
      type: 'string',
      description: '要留给下一个会话的结论：改了什么、为什么、验证方式、踩到的坑与最终解法。',
    },
    agent: {
      type: 'string',
      description: '记录者标识，默认 dsh。',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description: '本次涉及的文件路径列表。',
    },
  },
  required: ['task', 'summary'],
  additionalProperties: false,
}

const SESSION_PARAMETERS = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: '会话 id，例如 2026-11-12-141957-560-codex-a6c3a2。支持只用一部分：结尾 6 位（a6c3a2）或开头日期（2026-11-12-141957）。',
    },
    agent: {
      type: 'string',
      description: '只看某个 agent 的记录，例如 codex / dsh / sol。可选。',
    },
    limit: {
      type: 'number',
      description: '不给 id 时列出最近多少条会话，默认 10，上限 30。',
    },
  },
  additionalProperties: false,
}

const STATUS_PARAMETERS = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

/**
 * @param {object} ctx plugin context
 * @param {{recallBudget: number, autoHandoff?: boolean}} settings
 */
export function registerTools(ctx, settings) {
  ctx.tools.register(
    {
      name: 'contextgraph_recall',
      description:
        '查询本项目的 ContextGraph 项目记忆（历史决策、踩坑与解法、部署/环境事实、必须遵守的规则、测试命令）。' +
        '在动手改代码前先调用它，比直接 grep 代码更快得到“为什么这样写”。' +
        '按 file 查询时会额外返回该文件关联的规则与必须运行的测试。结果带来源文件与行号。',
      parameters: RECALL_PARAMETERS,
      output: TEXT_OUTPUT,
      isConcurrencySafe: true,
      async execute(args, exec) {
        const root = projectRoot(ctx, exec)
        if (!root) return notInitialized()
        const db = openGraph(root)
        try {
          const freshness = assessFreshness(root, db)
          return recall(db, freshness, {
            query: typeof args?.query === 'string' ? args.query : '',
            file: typeof args?.file === 'string' ? args.file : '',
            module: typeof args?.module === 'string' ? args.module : '',
            limit: Number.isFinite(args?.limit) ? Number(args.limit) : 8,
            budget: settings.recallBudget,
          })
        } catch (error) {
          return { text: `读取 ContextGraph 失败：${messageOf(error)}`, count: 0 }
        } finally {
          db.close()
        }
      },
    }
  )

  ctx.tools.register(
    {
      name: 'contextgraph_handoff',
      description:
        '把本次会话的结论写入项目的 ContextGraph 记忆库，供后续会话检索。' +
        '在完成一段有意义的改动、或用户说“收尾/交接/记一下”时调用。' +
        'task 写做什么，summary 写改了什么、为什么这样改、怎么验证、踩了什么坑。',
      parameters: HANDOFF_PARAMETERS,
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const root = projectRoot(ctx, exec)
        if (!root) return notInitialized()
        try {
          const result = recordHandoff(root, {
            task: args?.task,
            summary: args?.summary,
            agent: args?.agent ?? 'dsh',
            files: args?.files ?? [],
          })
          const db = openGraph(root)
          let counts
          try {
            counts = readCounts(db)
          } finally {
            db.close()
          }
          return {
            text:
              `已写入 ContextGraph：会话 ${result.sessionId}\n` +
              `- 任务：${result.task}\n` +
              `- 关联文件：${result.files} 个\n` +
              `- 库规模：${counts.nodes} 节点 / ${counts.edges} 边`,
          }
        } catch (error) {
          return { text: `写入 ContextGraph 失败：${messageOf(error)}` }
        }
      },
    }
  )

  ctx.tools.register(
    {
      name: 'contextgraph_session',
      description:
        '按 id 取一次 ContextGraph 会话记录的全文：任务、结论、涉及文件、git HEAD。' +
        '当你看到一个形如 2026-11-12-141957-560-codex-a6c3a2 的 id（出现在 commit message、日报、交接文档、其他项目的 handoff 里），' +
        '用这个工具直接取，不要用 contextgraph_recall——recall 会把 id 拆成词去模糊匹配，返回一堆无关规则且不报错。' +
        'id 支持前缀：只给 a6c3a2 或 2026-11-12-141957 也能命中；不给 id 时列出最近若干条会话。',
      parameters: SESSION_PARAMETERS,
      output: TEXT_OUTPUT,
      isConcurrencySafe: true,
      async execute(args, exec) {
        const root = projectRoot(ctx, exec)
        if (!root) return notInitialized()
        const id = typeof args?.id === 'string' ? args.id.trim() : ''
        const db = openGraph(root)
        try {
          const { exact, matches, recent } = findSessions(db, {
            id,
            agent: typeof args?.agent === 'string' ? args.agent : '',
            limit: Number.isFinite(args?.limit) ? Number(args.limit) : 10,
          })
          return {
            text: renderSessions(exact, matches, recent, { id, db }),
            count: exact ? 1 : matches.length || recent.length,
          }
        } catch (error) {
          return { text: `读取 ContextGraph 会话失败：${messageOf(error)}`, count: 0 }
        } finally {
          db.close()
        }
      },
    }
  )

  ctx.tools.register(
    {
      name: 'contextgraph_status',
      description:
        '查看本项目 ContextGraph 记忆库的状态：是否已索引、哪些源文件在索引后被改动、各类型记录数量。' +
        '当怀疑记忆过期、或要判断是否该重新运行 contextgraph index 时调用。',
      parameters: STATUS_PARAMETERS,
      output: TEXT_OUTPUT,
      isConcurrencySafe: true,
      async execute(_args, exec) {
        const root = projectRoot(ctx, exec)
        if (!root) return notInitialized()
        const db = openGraph(root)
        try {
          const freshness = assessFreshness(root, db, { force: true })
          const counts = readCounts(db)
          return { text: renderStatus(root, freshness, counts) }
        } catch (error) {
          return { text: `读取 ContextGraph 状态失败：${messageOf(error)}` }
        } finally {
          db.close()
        }
      },
    }
  )
}

function renderStatus(root, freshness, counts) {
  const lines = [
    `ContextGraph · ${root}`,
    `状态：${describeFreshness(freshness)}（可信度 ${freshness.trust}）`,
    `规模：${counts.sources} 源文件 / ${counts.blocks} 块 / ${counts.nodes} 节点 / ${counts.edges} 边`,
  ]
  if (freshness.lastIndexedAt) lines.push(`上次索引：${freshness.lastIndexedAt}（${relativeTime(freshness.lastIndexedAt)}）`)
  if (freshness.indexedHead) lines.push(`索引时 HEAD：${short(freshness.indexedHead)}，当前 HEAD：${short(freshness.currentHead) ?? '非 git 仓库'}`)
  if (freshness.changedCount > 0) {
    const shown = freshness.changedPaths.slice(0, 8).join('、')
    lines.push(`索引后改动：${freshness.changedCount} 个文件${shown ? `（${shown}${freshness.changedCount > 8 ? ' 等' : ''}）` : ''}`)
    lines.push('提示：改动较多时运行 `contextgraph index` 刷新；少量改动可以直接继续，召回结果会标记受影响条目。')
  }
  if (freshness.state === 'drift') {
    lines.push('说明：HEAD 变了但源文件没变（切换分支/合并/变基），记忆仍然有效，无需重新索引。')
  }
  if (freshness.failedBlocks > 0) lines.push(`索引时有 ${freshness.failedBlocks} 个块失败，建议重新运行 contextgraph index。`)
  if (freshness.state === 'none') lines.push('提示：运行 `contextgraph init && contextgraph index` 建立初始记忆。')
  return lines.join('\n')
}

function short(value) {
  return typeof value === 'string' && value.length > 8 ? value.slice(0, 8) : value ?? null
}

/** Resolve the workspace root for the calling agent's session. */
function projectRoot(ctx, exec) {
  let cwd
  try {
    const session = exec?.agent?.session
    if (session) cwd = ctx.workingDirectory.get(session)
  } catch {
    cwd = undefined
  }
  if (!cwd) {
    try {
      cwd = exec?.agent?.session?.cwd ?? undefined
    } catch {
      cwd = undefined
    }
  }
  return cwd ? findGraphRoot(cwd) : null
}

function notInitialized() {
  return {
    text:
      '当前工作目录没有 ContextGraph 记忆库（.contextgraph/graph.db）。\n' +
      '若要启用：在项目根目录运行 `contextgraph init`，然后 `contextgraph index`。',
    count: 0,
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
