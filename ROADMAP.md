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
- Context / Embedding / Extractor status panel，其中 Embedding 和 Extractor 目前为 disabled 默认态
- MCP lazy diagnostics
- `diagnose_contextgraph`
- `reload_contextgraph`
- local watcher with `contextgraph watch`

Level 0 后续还要继续加固中文 trigram 片段检索、query 结果字段和 status 可靠性展示，但不能引入模型硬依赖。

## Engineering Priority Order

后续开发按工程可信度优先，而不是按“看起来更智能”的模型能力优先：

1. **Level 0 Hardening**
   - MCP 长进程 reload / lazy refresh：已具备首版 `reload_contextgraph`
   - MCP diagnostics：已具备首版 `diagnose_contextgraph`
   - CLI 和 MCP 状态一致：已改为每次 tool 调用重新读取本地状态
   - watcher：已具备首版 `contextgraph watch`
   - status 拆 Context / Embedding / Extractor：已具备 disabled 默认态
   - query 结果字段稳定
   - 中文 trigram / LIKE fallback 补强
2. **Brief Productization**
   - `contextgraph brief`：已具备首版
   - `contextgraph brief --task "修改区块链附件上传"`：已具备首版
   - `contextgraph brief --file ...`：已具备首版
   - `contextgraph brief --domain blockchain`：已具备首版
3. **Experience-to-Source Association**
   - 从文档、handoff、测试中抽文件路径、模块名和测试命令：已具备首版
   - 建立 `RELATED_TO_FILE`、`APPLIES_TO`、`REQUIRES_TEST`：已具备首版
   - 支持 `query --file` / `query --module`：已具备首版
4. **Project Detector + Presets**
   - `basic`：已具备首版
   - `project`：已具备首版
   - `api`：已具备首版扫描 preset，结构化 API parser 待做
   - `source-comments`：保留 preset 边界，注释抽取待做
   - `source`：保留显式边界，不默认启用
5. **Embedding**
   - 已具备首版可选 provider 配置、SQLite 缓存、增量 rebuild、状态面板、query graph expansion 和 candidate semantic edges
   - 后续继续增强 hybrid scoring、provider 生态和大索引性能
6. **LLM Extractor**
   - 最后接入，保持可选、本地、缓存、candidate 和 schema 校验

Embedding 和 LLM 不能用来掩盖基础状态、MCP 生命周期、brief 组织能力和查询字段稳定性问题。

## v0.1.x: Query Planner Lite

当前阶段目标是修复 MCP 自然语言查询对关键词组合敏感的问题。ContextGraph does not make agents better at grep. It removes the need for agents to guess the right grep query.

能力范围：

- `normalizeQuery`
- intent inference
- entity extraction: terms、numbers、ports、ips、files、configKeys
- query expansion
- FTS / trigram multi-query retrieval
- deduplicate + rerank
- zero-result fallback with query plan and suggestions
- `contextgraph explain-query "<query>"`

MCP 的 `get_relevant_context` 不允许只执行一次 raw FTS。它必须基于 query plan 多路召回，并在 expanded query 命中时标注 matched query。

## Product Boundary: Project Experience Facts

ContextGraph 不是低配 CodeGraph，也不应该进入完整源码解析、符号表和调用链赛道。

- CodeGraph / Sourcegraph / LSP / IDE indexes 负责代码事实：类、函数、符号引用、调用链、接口实现和模块依赖。
- ContextGraph 负责项目经验事实：agent 指令、项目规约、历史踩坑、修复经验、测试要求、部署注意事项、handoff、团队约定和工具环境。

下一阶段允许 ContextGraph 关联源码路径、模块名和测试命令，但这只是把经验节点落到具体文件或模块上，不是解析源码语义。目标是回答“这个文件/模块相关的项目经验、规则、风险和测试是什么”，而不是回答“这个函数被谁调用”。

Source Comments 和 Swagger / OpenAPI 作为可选索引来源时，也必须遵守这个边界：

Use CodeGraph for code facts.
Use ContextGraph for project experience facts.

Source comments and OpenAPI belong to ContextGraph only when they express project experience, operational constraints, interface contracts, risks, compatibility notes, or testing/deployment requirements.

ContextGraph 不解析源码 AST，不提供调用链、符号引用、interface 实现或 Spring Bean 注入分析。

## Second Priority: Brief Productization

`brief` 应该成为 ContextGraph 的核心卖点：新 Agent 进入项目时，最需要的不是先猜 query，而是先获得可信开工视图。

目标命令：

```bash
contextgraph brief
contextgraph brief --task "修改区块链附件上传"
contextgraph brief --file src/blockchain/upload.ts
contextgraph brief --domain blockchain
```

目标输出：

- P0 铁律
- 当前 source of truth
- 必须跑的测试
- 部署/环境警告
- 最近 handoff
- 过期/冲突信息
- 常见失败
- 相关文件

`brief` 要从“高优先级节点摘要”升级为 task-aware / file-aware / domain-aware 的开工面板。

## Brief Foundation: Experience Domains And Trust Semantics

v0.2 需要把 ContextGraph 从“能搜到经验块”推进到“能围绕任务组织经验视野”。区块链维护案例是目标场景：非区块链工程师维护多客户链上集成时，必须先看到边界、端点、txid 规则、废弃文档和历史失败模式，再改代码。

新增概念：

- `Knowledge Domain`：项目经验所属领域，例如 `blockchain`、`deployment`、`testing`、`frontend`、`backend`。
- `Priority`：先收敛到 `P0` / `P1` / `P2`。P0 Rule 是强约束，查询和 brief 中必须优先展示。
- `Status`：经验事实状态扩展为 `confirmed`、`candidate`、`deprecated`、`conflict`、`stale`。
- `EnvironmentFact`：保存环境地址、用途、source、`last_verified_at` 和 `status`，用于部署、链服务、测试环境、客户环境等信息。
- `supersedes`：新文档、新 handoff 或新规则替代旧文档或旧规则。

Task-aware retrieval:

- `query` / `brief` 应根据任务文本自动识别 domain。
- `contextgraph brief "<task>"` 输出：
  - `P0 Rules`
  - `Current Source of Truth`
  - `Environment Facts`
  - `Required Flow`
  - `Required Tests`
  - `Deprecated Docs`
  - `Known Failure Modes`
  - `Related Files`
- AGENTS.md 是入口，ContextGraph 是经验索引和全局视图。AGENTS.md 应告诉 Agent 使用 ContextGraph，ContextGraph 则负责按任务返回可溯源、带优先级和新鲜度的全局经验。

## First Priority: Level 0 Hardening

一次真实项目试用暴露出几个比 embedding 更靠前的开箱即用问题。它们属于 Level 0 hardening，必须在语义索引扩展前优先处理：

- MCP server 由 IDE 作为长期 stdio 进程管理。如果 IDE 启动 MCP 时项目尚未 `init`，后续 CLI 完成 `init` / `index` 后，MCP 仍可能停留在旧状态。
- MCP tool 需要在每次调用时重新检测 `.contextgraph/config.json`、`.contextgraph/graph.db` 和 `lastIndexedAt`，不能把启动时的失败状态当成永久状态。
- MCP 需要提供明确诊断：当前 `projectRoot`、`dbPath`、数据库是否存在、`lastIndexedAt`、索引新鲜度、建议执行的命令，以及是否可能需要 IDE 重启。
- MCP 应增加显式 reload 能力，例如 `reload_contextgraph`，用于重新读取配置和数据库状态。
- CLI 与 MCP 必须保持状态一致：CLI 已经能读到的初始化和索引结果，MCP 不应继续报告未初始化。
- 增加 watcher：已具备首版 `contextgraph watch`，只维护本地索引新鲜度，不引入网络或远程服务依赖。
- status 应拆成 Context / Embedding / Extractor，即使 embedding 和 extractor 还未实现，也要显示 disabled 默认态。
- query 结果字段必须稳定，至少包括 source、line range、type、priority、confidence、status、freshness、matched query。
- 继续补强中文 trigram / LIKE fallback。
- status 应强调 context freshness，而不是假装提供 code index freshness。

这些修复的验收目标是：用户完成 `contextgraph init && contextgraph index` 后，无论通过 CLI 还是 MCP 查询，都能得到一致、可解释、可恢复的状态。

## Third Priority: Experience-to-Source Association

这个阶段比 embedding 更早产生价值。ContextGraph 不解析 AST，只把经验事实关联到文件、目录、模块和测试命令。

能力范围：

- 从文档、handoff、测试和 session summary 中抽取文件路径、目录、模块名和测试命令。
- 从 query / brief 输入中识别文件路径和模块名。
- 建立 `RELATED_TO_FILE`、`APPLIES_TO`、`REQUIRES_TEST`、`MENTIONS_MODULE`。
- 增加 `query --file <path>` 和 `query --module <name>`。
- 让 Agent 在改某个文件前知道相关规约、历史失败、必跑测试和环境风险。

明确边界：

- 这些关系是项目经验关联，不是调用链。
- 不声明“这个函数调用了谁”。
- 不声明“这个 interface 有哪些实现”。
- 不推断 Spring Bean 注入关系。

## Fourth Priority: Project Detector And Presets

默认 preset 不能太贪。目标是安全、有用、可解释，而不是默认扫完整源码树。

Preset 规划：

- `basic` 保持轻量，覆盖 README、AGENTS、docs、规则、测试和关键配置。
- `project` 面向新 Agent 开箱即用，补充 package/pom/docker/bruno/playwright/openapi、常见项目入口、部署配置和脚本。
- `api` 索引 OpenAPI / Swagger 接口契约。
- `source-comments` 只提取高价值源码注释。
- `source` 需要显式用户确认，仍然不做代码图谱。

Project detector:

- `init` 已根据目录结构和标志文件自动识别 JS/Node、Python、Java/Maven、Go、Rust、Docker 和 OpenAPI / Swagger。
- 默认 `project` preset 覆盖 agent-facing docs、rules、tests、Bruno、Playwright、package/pom/pyproject/go/cargo、Docker 和 OpenAPI / Swagger。
- 默认 preset 不纳入 `src/**/*.ts`、`src/**/*.js` 或普通源码实现，避免把 ContextGraph 误用成源码知识图谱。
- source / source-comments 必须显式启用，并继续避免扫入低价值或高噪声内容，例如 `node_modules`、构建产物、锁文件、生成文件、大型静态资源、二进制文件和历史数据库。

## v0.2.x: API Contract Preset

目标：把 Swagger / OpenAPI 作为接口契约纳入项目经验图谱，让 Agent 在修改接口、测试、客户端集成或部署配置前能看到当前接口边界。

首版状态：`contextgraph index --preset api` 已可额外扫描 OpenAPI / Swagger 文件；结构化 API 节点解析仍在后续切片中实现。

新增命令：

```bash
contextgraph index --preset api
```

默认扫描：

- `openapi.json`
- `openapi.yaml`
- `swagger.json`
- `swagger.yaml`
- `docs/**/openapi*.json`
- `docs/**/swagger*.yaml`

解析范围：

- endpoint
- method
- path
- request params
- request body
- response schema
- tags
- deprecated 状态

生成节点：

- `ApiEndpoint`
- `ApiSchema`
- `ApiParameter`
- `ApiResponse`
- `ApiContract`

查询行为：

- `query` / `brief` 可以召回相关接口契约。
- API 契约节点优先级高于普通 README 描述。
- deprecated endpoint 必须以 warning 或 deprecated status 呈现。
- API preset 不做后端源码调用链分析，也不推断 controller / service / DAO 关系。

## v0.2.x / v0.3.x: Source Comments Preset

目标：索引“源码附近的项目经验”，但不索引普通代码实现，不进入源码知识图谱赛道。

新增命令：

```bash
contextgraph index --preset source-comments
```

支持语言：

- Java
- JavaScript
- TypeScript
- Vue
- Python
- Go

只保留高价值注释。关键词包括：

- 必须
- 禁止
- 不能
- 不得
- 不要
- 注意
- 坑
- 兼容
- 历史
- 生产
- 部署
- 测试
- 回滚
- 风险
- 不能删除
- 不能修改
- TODO
- FIXME
- HACK
- deprecated
- legacy
- must
- never
- do not
- warning
- production

生成 `SourceComment` 节点，并分类为：

- `Rule`
- `Risk`
- `Failure`
- `Fix`
- `EnvironmentFact`
- `Decision`
- `CompatibilityNote`
- `Todo`
- `DeprecatedNote`

SourceComment 默认语义：

- `status=candidate`
- `confidence=medium`
- 必须保留 source file 和 line range
- query 结果必须明确显示来自 `source_comment`
- 不默认全量开启，必须通过 preset 或配置启用

限制：

- 不索引普通代码实现。
- 不做 AST 语义解析。
- 不做调用链分析。
- 不做符号引用或 interface 实现分析。
- 不把注释直接当作 confirmed rule；除非被 confirmed docs、handoff、测试验证或用户确认强化。

## Fifth Priority: Embedding Mode

目标：在 Level 0、brief、经验关联源码和 preset 稳定后，增加可选本地 embedding，让 ContextGraph 支持 semantic search、hybrid search 和 project experience blocks 之间的 candidate semantic edges。该阶段同时负责把文档规则、源码注释、OpenAPI 契约、测试脚本、handoff 和环境配置连接起来。

首版已实现：

- `contextgraph embedding enable --provider <provider> --model <model> [--endpoint <url>]`
- `contextgraph embedding disable`
- `contextgraph embedding status`
- `contextgraph embedding rebuild`
- SQLite `embeddings` 表，按 `(block_id, provider, model)` 缓存。
- `block_hash` 不变时跳过，不重复计算 embedding。
- provider 失败时不影响 Level 0 FTS / trigram 查询。
- `status` 显示 Embedding index freshness、pending embeds、candidate edge count、confirmed edge count 和 pending semantic edge blocks。
- rebuild 后按相似度建立 `SEMANTICALLY_RELATED` candidate edge。
- query 时不调用模型，只沿已有 candidate semantic edge 做 graph expansion。

命令：

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

第一版已实现 provider 接口、配置、状态、schema、pending 统计、OpenAI-compatible local endpoint 和 Ollama endpoint。`local-onnx` 仍为预留接口，不打包模型。

核心要求：

- embedding 默认关闭。
- embedding provider 不可用时，query 自动降级到 Level 0。
- 每个 block / node 生成 embedding，并与 `block_hash` 绑定缓存。
- 对新增或变更 block，只计算该 block embedding。
- 向量写入本地 SQLite，不依赖外部向量数据库。
- npm 包不内置模型文件。
- 索引后，对相似度超过阈值的 block 建立 candidate edge。
- candidate edge 不等同 confirmed edge，必须带 score、provider、model、status。
- 新增 candidate edge 类型：`SEMANTICALLY_RELATED` 已落地；`SAME_DOMAIN`、`MAY_APPLY_TO`、`POSSIBLY_CONFLICTS`、`POSSIBLY_REINFORCES` 后续扩展。
- confirmed edge 只能来自显式规则、用户确认、handoff 明确说明、测试验证或 LLM extractor 结构化判断。

计划关联：

- 文档规则 ↔ 源码注释
- OpenAPI endpoint ↔ 测试脚本
- OpenAPI endpoint ↔ handoff 经验
- OpenAPI endpoint ↔ 环境配置

这些关联默认是 candidate semantic edges，必须带 score、provider、model 和 status。

## Sixth Priority: Local LLM Extract Mode

目标：在 embedding 和基础治理稳定后，最后增加可选本地 LLM 抽取，把高价值上下文转成结构化经验节点。

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
- 来自 docs/deployment.md
- 包含“测试 / test / playwright / junit / bruno”
- 包含“生产 / 部署 / IP / 端口 / nginx / docker”

抽取结果必须是结构化 JSON，并通过 schema 校验。目标类型包括 Rule、Failure、Fix、Decision、TestRequirement、Risk 和 EnvironmentFact。默认 `status` 为 `candidate`，未来通过 `contextgraph approve` 提升为 `confirmed`。

核心限制：

- 不内置 LLM。
- 默认不联网。
- 远程 provider 必须显式开启。
- `contextgraph query` 禁止实时调用 LLM。
- provider 不可用时不影响 Level 0 查询。
- query 时禁止实时调用 LLM 理解全库；LLM 只在 index、handoff、rebuild 或 background extraction 时运行。

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
Pending semantic edge blocks: 4
Candidate edges:  128
Confirmed edges:  42
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
- `api` preset 能索引 OpenAPI / Swagger，并生成 ApiEndpoint / ApiSchema / ApiParameter / ApiResponse / ApiContract。
- API 契约节点能被 `query` / `brief` 召回，且优先级高于普通 README 描述。
- deprecated API 必须显示 deprecated status 或 warning。
- `source-comments` preset 只提取高价值注释，不索引普通源码实现。
- SourceComment 默认是 candidate、medium confidence，并保留 source file 与 line range。
- query 结果必须明确显示 source comment 来源，避免 Agent 把过期注释误认为 confirmed rule。
- README 和命令输出必须明确：ContextGraph 是项目经验事实层，不替代 CodeGraph / Sourcegraph / LSP 的代码事实层。
- `query --file` / `query --module` 能返回关联的规则、失败、修复、测试要求和 handoff，并标明这些是经验关联，不是代码调用链。
- `explain-query` 能展示 normalize、intent、entities、expanded queries 和 retriever plan。
- MCP 自然语言查询必须使用 Query Planner Lite，多路召回并在 expanded query 命中时返回 matched query。
- 启用 embedding 后，只对新增或变更 block 生成向量。
- `block_hash` 不变时，不重复计算 embedding。
- embedding 能为相似 project experience blocks 建立 candidate semantic edges，并在 status 中展示候选边数量、confirmed 边数量和待处理 block 数。
- candidate semantic edge 不得被当作 confirmed rule 或 confirmed relationship。
- 启用 extractor 后，只处理高价值 block。
- provider 不可用时，基础 query 自动降级。
- status 明确显示 Context index / Embedding index / Extractor index 的新鲜度。
- query 结果标注来源、置信度和 status。
- 所有新增功能必须有测试。
