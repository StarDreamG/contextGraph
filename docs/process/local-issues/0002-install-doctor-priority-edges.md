# 0002 Install Layer, Doctor, Priority, and Edges

## Background

MVP 已经跑通 `init -> index -> status -> query -> handoff -> mcp`，但本机其他 Agent 接入还不够稳定，且图谱产物只有节点集合，`edges` 统计为 0，新 Agent 无法判断哪些上下文最重要。

## User story

作为新接入项目的 Agent，我希望能通过稳定的本机命令和 MCP 入口读取 ContextGraph，并优先看到必须遵守的规约、踩坑经验和验证要求，同时能从图谱边关系理解节点之间的联系。

## Scope

- 增加 `contextgraph doctor`，检查运行时、SQLite 原生依赖、项目初始化和索引状态。
- 支持 `contextgraph mcp --project <path>`，让 MCP 不依赖启动目录。
- 为节点写入 `priority` 和 `priorityReason`。
- 为同一 block 内节点建立基础边关系。
- 至少识别 `Failure -> Fix` 的 `fixed_by` 关系。
- 查询结果按优先级优先返回，并显示优先级。
- 为中文连续文本增加 literal 查询兜底，减少 FTS 分词漏召回。

## Out of scope

- 不实现历史 session 导入。
- 不实现完整工具环境画像。
- 不实现远程 npm 发布。
- 不引入远程 LLM、embedding 或向量数据库。

## Acceptance criteria

- [ ] `contextgraph doctor --project <path>` 显示项目是否初始化、索引状态、节点数和边数。
- [ ] `contextgraph mcp --help` 显示 `--project <path>`。
- [ ] 索引含规则、失败和修复的内容后，`Edges created` 大于 0。
- [ ] `nodes.metadata` 包含 `priority` 和 `priorityReason`。
- [ ] “禁止/不允许/生产/secret/token/互联网”等强约束规则为 P0。
- [ ] 失败和修复经验默认为 P1。
- [ ] 查询结果中高优先级规则排在普通 Note 前面。
- [ ] `npm run build && npm run check && npm test` 通过。

## Technical notes

- 优先级暂存于 `nodes.metadata`，避免本阶段引入数据库表迁移复杂度。
- 基础边关系使用现有 `edges` 表。
- 通过 `indexVersion` 状态值触发旧索引产物补齐 priority 和 edges。

## Risks

- 中文 FTS 对连续中文文本召回不稳定，需要 literal fallback。
- 同一 block 同时包含多种语义时，优先级规则不能把所有节点都抬成 P0。
- 边关系初期是规则化关系，不代表完整语义图谱。
