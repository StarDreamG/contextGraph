# 0001 ContextGraph MVP

## Background

ContextGraph 需要为编程 Agent 提供本地、可查询、可信的新鲜上下文图谱，避免每次任务都从 grep/read 重新发现项目经验。

## User story

作为编程 Agent 或开发者，我希望通过本地 CLI 和 MCP 查询项目规约、命令、测试、失败、修复和会话交接信息，从而基于统一上下文工作。

## Scope

- 实现 `init -> index -> status -> query -> handoff -> mcp`。
- 使用 TypeScript、Node.js 22 LTS、SQLite 和 FTS5。
- 仅支持仓库内 npm scripts 运行。
- 支持 Markdown、JSON、普通文本索引。
- 实现 hash 增量索引、状态可信度、secret 脱敏、基础 MCP tools。
- 提供 README 和自动化测试。

## Out of scope

- Watch 模式。
- 远程 LLM、云同步、向量数据库、UI、编辑器扩展。
- 全局 npm 安装、`npm link`、Docker 运行。
- 存量历史 session 导入不在 MVP 内实现，但 Phase 2 必须实现，不能从路线中移除。

## Acceptance criteria

- [ ] 空项目可执行 `contextgraph init`。
- [ ] 索引 `AGENTS.md` 后生成并填充 `.contextgraph/graph.db`。
- [ ] `status` 显示 Fresh/Stale、Reliability、Last indexed、Current HEAD、Indexed HEAD。
- [ ] 修改配置内源文件但不重新索引时状态变为 Stale。
- [ ] 重新索引后状态恢复 Fresh。
- [ ] `query "测试"` 返回 Test、Rule 或 Command 节点及来源证据。
- [ ] `handoff` 写入 session 和相关节点。
- [ ] `mcp` 通过 stdio 暴露 `get_context_status` 和 `get_relevant_context`。
- [ ] Secret 不以明文持久化。
- [ ] `npm test`、类型检查、构建全部通过。
- [ ] README 可指导新用户在不全局安装的情况下跑通流程。

## Technical notes

- 规格来源：`docs/superpowers/specs/2026-06-15-contextgraph-mvp-design.md`。
- 当前仓库已关联 `git@github.com:StarDreamG/contextGraph.git`，只允许本地 commit，不允许 push。
- 仓库 Git 身份必须为 `StarDreamG <StarDreamG@users.noreply.github.com>`。

## Risks

- better-sqlite3 原生依赖与 Node 版本兼容。
- status 若只比较 Git HEAD 会漏掉未提交文件变化。
- MCP stdout 被日志污染会破坏协议。
- FTS 查询语法需要清洗。
- 如果没有 Phase 2 的存量 session 导入，已有项目只能从新 handoff 开始积累，上手价值会不足。
