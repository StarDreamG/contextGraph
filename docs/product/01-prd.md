# Product Requirements Document

## Background
AI Coding Agent 在同一个项目中会不断积累规约、调试过程、测试命令、环境细节、失败原因和修复方案。当前这些上下文分散在 Markdown、Git 历史、Agent session、本机记忆和临时对话中，导致新任务启动时仍要重复搜索、阅读和猜测。

ContextGraph 的目标是把项目上下文预索引成本地图谱，并用状态层告诉 Agent 当前上下文是否可信。

## Current Pain Points
- Requirement changes are hard to track.
- Product background, design, concrete tasks, and implementation status are mixed together.
- It is hard to know which requirements have been implemented.
- Codex needs stable context and clear execution boundaries.

## Target Workflow
Idea → Product context → Issue → Implementation → PR → Review → Done → Documentation update if needed.

## Requirement Types
- Epic: large product direction
- Feature: user-facing or system-facing capability
- Task: concrete implementation work
- Bug: defect
- Design Change: change to product behavior, architecture, or workflow

## MVP Scope
- 仓库内运行的 TypeScript CLI。
- `init -> index -> status -> query -> handoff -> mcp` 本地闭环。
- 索引项目规约、README、docs、测试配置、命令和新的 handoff 摘要。
- SQLite + FTS5 本地存储。
- 默认离线、敏感路径忽略、secret 脱敏。
- MCP 首期提供状态查询和相关上下文查询。

## Phase 2 Required Scope
- 必须支持导入本机已有 Agent session，尤其是 Codex 历史 session。这是工具开箱即用的关键能力。
- 导入必须按项目归属过滤，只导入与当前项目路径、Git remote、文件路径或明确任务上下文相关的 session。
- 必须从历史 session 和本地项目上下文中抽取“项目工具环境画像”，包括该项目曾经加载或依赖过的 MCP server、skills、插件/连接器、浏览器自动化能力、测试工具和文档/表格/PDF 等工作能力。
- 项目工具环境画像必须能回答：这个项目中，新 Agent 开始工作前通常应该启用哪些 MCP server、优先使用哪些 skills、哪些工具只在特定任务中使用，以及哪些工具曾经失败或不适用。
- 导入前必须做敏感内容脱敏，并保留来源、时间、项目归属和置信度。
- 默认导入摘要化后的经验节点，而不是把原始长对话全文直接塞进图谱。
- 必须支持增量导入、导入状态、失败重试和可审计日志。
- 必须允许用户限制时间范围，例如最近 7 天、30 天或指定日期之后。
- 不得自动读取所有私有记忆或跨项目 session；跨项目导入必须显式授权。

## Out of Scope
- MVP 不做历史 session 导入，但 Phase 2 必做。
- MVP 不做 watch、embedding、向量数据库、远程 LLM、UI、云同步、团队权限或编辑器扩展。

## Open Questions
- Phase 2 首批支持哪些 session 来源：Codex 原始 session、Codex rollout summary、Claude/Cursor 历史，还是先只做 Codex。
- 历史 session 项目归属的置信度阈值如何定义。
- 是否需要在导入前提供 dry-run 报告和逐项确认。
- 工具环境画像的数据模型如何拆分：`McpServer`、`Skill`、`Plugin`、`ToolCapability` 是否作为独立节点类型，还是先统一为 `ToolCapability`。
