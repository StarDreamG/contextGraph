# ContextGraph Roadmap

ContextGraph 的方向是从关键词索引升级为语义上下文索引。升级必须分层推进：基础能力保持轻量稳定，模型能力全部可选、可缓存、可降级。

## Current Baseline: Level 0

当前 `0.1.x` 基线已经具备：

- Markdown / JSON / Text parser
- block 切分
- SQLite 本地存储
- FTS5 检索
- 中文片段检索 fallback
- `status`
- `query`
- `handoff`
- stdio MCP server
- 本地 secret redaction 和敏感路径忽略

Level 0 后续还要继续加固中文 trigram 片段检索、query 结果字段和 status 可靠性展示，但不能引入模型硬依赖。

## Product Boundary: Project Experience Facts

ContextGraph 不是低配 CodeGraph，也不应该进入完整源码解析、符号表和调用链赛道。

- CodeGraph / Sourcegraph / LSP / IDE indexes 负责代码事实：类、函数、符号引用、调用链、接口实现和模块依赖。
- ContextGraph 负责项目经验事实：agent 指令、项目规约、历史踩坑、修复经验、测试要求、部署注意事项、handoff、团队约定和工具环境。

下一阶段允许 ContextGraph 关联源码路径、模块名和测试命令，但这只是把经验节点落到具体文件或模块上，不是解析源码语义。目标是回答“这个文件/模块相关的项目经验、规则、风险和测试是什么”，而不是回答“这个函数被谁调用”。

## Next Priority: MCP Lifecycle And Index Presets

一次真实项目试用暴露出几个比 embedding 更靠前的开箱即用问题。它们属于 Level 0 hardening，必须在语义索引扩展前优先处理：

- MCP server 由 IDE 作为长期 stdio 进程管理。如果 IDE 启动 MCP 时项目尚未 `init`，后续 CLI 完成 `init` / `index` 后，MCP 仍可能停留在旧状态。
- MCP tool 需要在每次调用时重新检测 `.contextgraph/config.json`、`.contextgraph/graph.db` 和 `lastIndexedAt`，不能把启动时的失败状态当成永久状态。
- MCP 需要提供明确诊断：当前 `projectRoot`、`dbPath`、数据库是否存在、`lastIndexedAt`、索引新鲜度、建议执行的命令，以及是否可能需要 IDE 重启。
- MCP 应增加显式 reload 能力，例如 `reload_contextgraph`，用于重新读取配置和数据库状态。
- CLI 与 MCP 必须保持状态一致：CLI 已经能读到的初始化和索引结果，MCP 不应继续报告未初始化。
- 默认索引范围需要从单一 sources 列表升级为 preset：`basic` / `project` / `source`。
- `init` / `index` 应具备 project detector，根据目录结构和标志文件自动识别 JS/Vue/Node、Python、Java/Maven、Go、Rust 等项目类型，并选择更合适的默认 include。
- framework-aware defaults 要覆盖项目关键入口。例如 JS/Vue 项目应自动纳入 `src/**/*.{js,ts,vue,jsx,tsx}`、`server/**/*.{js,ts,mjs,cjs}`、`scripts/**/*.{js,ts,mjs,cjs}`、`vite.config.*`、`package.json`、`Dockerfile*`、`docker-compose*.yml`、`bruno/**/*` 和 `tests/**/*`。
- `basic` 保持轻量，覆盖 README、AGENTS、docs、规则、测试和关键配置。
- `project` 面向新 Agent 开箱即用，补充常见项目入口、路由、服务端代理、部署配置和脚本。
- `source` 才允许扩展到源码全量或大范围索引，并必须有规模提示、强排除规则和可回退配置。
- source 索引必须避免扫入低价值或高噪声内容，例如 `node_modules`、构建产物、锁文件、生成文件、大型静态资源、二进制文件和历史数据库。
- 新增经验到源码的轻量关联能力：从文档、handoff 和 session summary 中抽取文件路径、目录、模块名和测试命令，建立 `RELATED_TO_FILE`、`APPLIES_TO` 和 `REQUIRES_TEST` 等关系。
- 增加 `query --file <path>` 和 `query --module <name>`，查询某个源码文件或模块关联的项目规约、失败、修复、风险、测试和 handoff。
- status 应强调 context freshness，而不是假装提供 code index freshness。

这些修复的验收目标是：用户完成 `contextgraph init && contextgraph index` 后，无论通过 CLI 还是 MCP 查询，都能得到一致、可解释、可恢复的状态。

## Level 1: Embedding Mode

目标：在 Level 0 之上增加可选本地 embedding，让 ContextGraph 支持 semantic search 和 hybrid search。

命令规划：

```bash
contextgraph embedding enable --provider ollama --model bge-m3
contextgraph embedding disable
contextgraph embedding status
contextgraph embedding rebuild
```

Provider 预留：

- `none`
- `ollama`
- `local-onnx`
- `openai-compatible-local-endpoint`

第一版先实现 provider 接口、配置、状态、schema 和 pending 统计；具体 provider 可以分批接入。

核心要求：

- embedding 默认关闭。
- embedding provider 不可用时，query 自动降级到 Level 0。
- `block_hash` 不变时不重复生成向量。
- 向量写入本地 SQLite，不依赖外部向量数据库。
- npm 包不内置模型文件。

## Level 2: Local LLM Extract Mode

目标：在 Level 1 之上增加可选本地 LLM 抽取，把高价值上下文转成结构化经验节点。

命令规划：

```bash
contextgraph extractor enable --provider ollama --model qwen2.5:7b
contextgraph extractor disable
contextgraph extractor status
contextgraph extractor rebuild
```

Extractor 只处理高价值 block，不处理全量内容。高价值判断包括：

- 包含“必须 / 禁止 / 不允许 / should / must / never”
- 包含“失败 / 报错 / error / failed / exception”
- 包含“修复 / fix / resolved / 解决”
- 包含“决定 / decision / ADR / 采用 / 选择”
- 来自 handoff / session summary
- 来自 AGENTS.md / CLAUDE.md / Cursor rules / docs/failures.md / docs/decisions.md

抽取结果必须是结构化 JSON，并通过 schema 校验。默认 `status` 为 `candidate`，未来通过 `contextgraph approve` 提升为 `confirmed`。

核心限制：

- 不内置 LLM。
- 默认不联网。
- 远程 provider 必须显式开启。
- `contextgraph query` 禁止实时调用 LLM。
- provider 不可用时不影响 Level 0 查询。

## Level 3: Governance Mode

目标：让 ContextGraph 不只是“能搜到”，而是能提示上下文可靠性和执行风险。

能力规划：

- 冲突规则检测
- 过期规则检测
- agent 修改前风险提示
- required tests 推荐
- stale context warning
- candidate / confirmed 规则治理

`contextgraph status` 必须升级为可靠性面板：

```text
Context index:    Fresh
Embedding:        enabled / disabled / stale / failed
Embedding model:  bge-m3
Pending embeds:   12
Extractor:        enabled / disabled / stale / failed
Extractor model:  qwen2.5:7b
Pending extracts: 3
Search mode:      FTS + trigram / hybrid
Reliability:      High / Medium / Low
```

如果 embedding 或 extractor 落后，不能只显示整体 `Fresh`。例如：

```text
Context index:        Fresh
Embedding index:      Stale
Extractor index:      Disabled
Overall reliability:  Medium
```

## Persistent Constraints

这些约束跨所有阶段生效：

- local-first by default
- 默认不联网、不上传、不调用远程 LLM
- provider 配置写入 config，并可审计
- `.env`、私钥、证书继续忽略
- secret redaction 在写入数据库前完成
- 模型能力可跳过、可缓存、可降级
- 查询时不跑模型
- 不引入云同步、团队权限、复杂 UI、内置大模型或强依赖向量数据库

## Acceptance Gates

后续实现每一阶段前都必须满足：

- 不启用 embedding / extractor 时，现有功能完全正常。
- MCP 启动早于项目初始化时，后续 `init` / `index` 后能通过 lazy reload 或显式 reload 恢复。
- MCP status 能说明当前项目路径、数据库路径、初始化状态、索引时间和下一步建议。
- project detector 能根据常见标志文件和目录结构自动选择适合的默认扫描范围。
- JS/Vue/Node 项目在不手动编辑 sources 的情况下也能索引到有效项目入口和源码上下文。
- 默认 indexing preset 不会意外扫入整个源码树；大范围 source 索引必须显式启用。
- source preset 必须有规模提示、排除规则和测试覆盖。
- README 和命令输出必须明确：ContextGraph 是项目经验事实层，不替代 CodeGraph / Sourcegraph / LSP 的代码事实层。
- `query --file` / `query --module` 能返回关联的规则、失败、修复、测试要求和 handoff，并标明这些是经验关联，不是代码调用链。
- 启用 embedding 后，只对新增或变更 block 生成向量。
- `block_hash` 不变时，不重复计算 embedding。
- 启用 extractor 后，只处理高价值 block。
- provider 不可用时，基础 query 自动降级。
- status 明确显示 Context index / Embedding index / Extractor index 的新鲜度。
- query 结果标注来源、置信度和 status。
- 所有新增功能必须有测试。
