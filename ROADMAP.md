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
- 启用 embedding 后，只对新增或变更 block 生成向量。
- `block_hash` 不变时，不重复计算 embedding。
- 启用 extractor 后，只处理高价值 block。
- provider 不可用时，基础 query 自动降级。
- status 明确显示 Context index / Embedding index / Extractor index 的新鲜度。
- query 结果标注来源、置信度和 status。
- 所有新增功能必须有测试。
