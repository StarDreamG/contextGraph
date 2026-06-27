# ContextGraph

ContextGraph exists because coding agents often explore project documents through narrow grep/read loops.

They may read one README section, one AGENTS.md fragment, or one previous note, then make decisions without seeing the whole project experience.

ContextGraph indexes agent-facing project knowledge into small, traceable, queryable context units, so a new agent can retrieve the relevant rules, decisions, tests, failures, fixes, and handoffs before acting.

Use CodeGraph for code facts.
Use ContextGraph for project experience facts.
Together, they give coding agents both structural understanding and operational memory.

ContextGraph is not a source-code graph. It does not replace Sourcegraph, CodeGraph, LSP, or IDE indexes. It complements them by indexing project experience facts:

- agent instructions
- project rules
- development workflows
- testing requirements
- handoff notes
- historical failures
- fixes
- decisions
- environment and deployment notes
- model/agent usage conventions
- high-value source comments when they express operational knowledge
- Swagger / OpenAPI interface contracts

Query results must show source, type, confidence/status, and freshness. Status and freshness are part of the trust layer, not optional display.

## 它是什么

ContextGraph 是面向 AI Coding Agent 的本地项目经验索引。它参考 CodeGraph 的“预索引、可查询、可溯源”思想，但索引对象不是源码，而是 README、AGENTS.md、CLAUDE.md、docs、handoff、session summary 和团队经验记录中面向 Agent 的项目知识。

它的根目的是避免 Agent 只用 `grep` / `rg` / `read` 抓到 README 或局部文档后，就把局部事实误判成项目全貌。ContextGraph 预索引的是 agent-facing project experience，让新 Agent 在动手前先看到规约、历史经验、测试要求、部署注意事项和工具环境，而不是从零试探。

ContextGraph 不和 CodeGraph 抢同一层：

- CodeGraph / Sourcegraph / LSP / IDE indexes 适合处理代码事实：类、函数、符号引用、调用链、接口实现和模块依赖。
- ContextGraph 处理项目经验事实：agent 指令、团队规约、历史踩坑、修复经验、测试要求、部署约束、handoff、决策、环境说明和模型/agent 使用约定。

Source comments 和 Swagger / OpenAPI 也遵守这条边界：只有当它们表达项目经验、运行约束、接口契约、风险、兼容性说明、测试或部署要求时，才属于 ContextGraph。普通代码实现、调用链、符号引用、interface 实现或 Spring Bean 注入分析仍然交给 CodeGraph / Sourcegraph / LSP。

AGENTS.md 是 Agent 的入口说明，ContextGraph 是入口背后的经验索引和全局视图。Agent 可以先读 AGENTS.md 获得开工约束，再通过 ContextGraph 查询当前任务相关的经验事实、新鲜度和优先级。

## 它不是什么

ContextGraph 不是 source-code knowledge graph，不替代 CodeGraph、Sourcegraph、LSP、IDE 索引或 tree-sitter 级源码解析。它不负责回答“这个方法有哪些调用方”“这个 Spring Bean 怎么注入”“这个 interface 有哪些实现”这类代码结构问题。

ContextGraph 也不是 Markdown 文档管理器、云知识库、向量数据库、远程 LLM 包装器或 UI 优先的文档产品。

第一版不会上传任何数据，不会调用远程 LLM，不会打开网络端口。

即使后续支持 Source Comments，也只提取高价值注释，不索引普通源码实现，不做 AST 语义分析，不建立调用链。即使后续支持 Swagger / OpenAPI，也只把它作为接口契约和项目经验事实，不把它扩展成完整后端代码图谱。

## 安装

通过 npm 全局安装：

```bash
npm install -g @stardreamg/contextgraph
```

也可以临时运行：

```bash
npx @stardreamg/contextgraph status
```

本仓库开发时安装依赖并构建：

```bash
npm install
npm run build
```

开发期推荐把本仓库链接成本机命令：

```bash
npm link
```

之后任意已初始化项目目录都可以直接运行：

```bash
contextgraph init
contextgraph init --preset auto
contextgraph index
contextgraph index --preset api
contextgraph status
contextgraph watch --debounce 500
contextgraph doctor
contextgraph brief
contextgraph query "测试"
contextgraph explain-query "智策星隔离要求，不能占用哪些端口和资源"
contextgraph embedding status
contextgraph embedding enable --provider openai-compatible-local-endpoint --model bge-m3 --endpoint http://127.0.0.1:11434/v1/embeddings
contextgraph embedding rebuild
contextgraph handoff --agent codex --task "实现功能" --summary "完成实现，已运行 npm test" --files "src/example.ts"
```

包入口不绑定本机绝对路径，会优先使用安装目录同级的 Node.js，减少全局安装 Node 与当前项目目录 Node 不一致导致的原生模块 ABI 问题。发布前通过 `npm pack --dry-run` 检查包内容。本地 `npm link` 后，后续迭代只需要在本仓库运行 `npm run build`，全局 `contextgraph` 命令会继续指向最新构建产物。

也可以不 link，直接使用仓库内 npm script：

```bash
npm run contextgraph -- status
```

## 命令

- `init`：创建 `.contextgraph`、`graph.db`、配置、状态文件和 AGENTS.md 指引。
- `init --preset auto|basic|project|api`：初始化时根据项目标志文件选择安全的经验来源预设。
- `index`：扫描配置的 sources，脱敏内容，生成 blocks、nodes、FTS 和状态。
- `index --preset api`：在当前配置之外额外纳入 OpenAPI / Swagger 契约来源。
- `status`：显示新鲜度和可信度。
- `watch`：监听本地已配置 sources，文件变化后自动 debounce 重建索引。
- `doctor`：检查 Node、SQLite 原生依赖、项目初始化状态和索引健康度。
- `brief`：为新 Agent 输出最高优先级的开工摘要。
- `query`：搜索相关项目上下文。
- `explain-query`：展示自然语言查询的 normalize、intent、entities 和 expanded queries。
- `embedding enable|disable|status|rebuild`：管理可选本地 embedding 缓存和候选语义边。
- `handoff`：记录 Agent 会话交接摘要。
- `mcp`：启动本地 stdio MCP Server，可通过 `--project <path>` 指定项目根目录。

## 图谱产物

`index` 会为节点写入优先级，并建立基础边关系：

- `P0`：强制禁令、安全/联网/账号/生产规则，例如“禁止接入互联网”。
- `P1`：必跑测试、踩坑经验、失败和修复方案。
- `P2`：业务决策、环境说明、流程和偏好。
- `P3`：普通说明。
- `P4`：模板或低信号内容。

当前边关系包括：

- `co_occurs_with`：同一上下文 block 内共同出现。
- `fixed_by`：失败经验指向修复方案。
- `RELATED_TO_FILE`：经验节点关联到文档中提到的源码、配置或测试文件。
- `APPLIES_TO`：规则、风险或经验适用于某个文件或模块。
- `REQUIRES_TEST`：相关文件或模块变更后应运行的测试。
- `SEMANTICALLY_RELATED`：由 embedding rebuild 发现的候选语义关系，默认 `status=candidate`，不是 confirmed 规则。

查询结果会优先返回高优先级节点，并显示 `Priority` 和原因。

`query` 和 MCP 的 `get_relevant_context` 不要求 Agent 猜中完美关键词。ContextGraph 会先生成轻量 query plan：

```text
natural language query
-> normalize
-> intent inference
-> entity extraction
-> query expansion
-> FTS / trigram retrieval
-> deduplicate + rerank
-> source/status/freshness-aware results
```

如果原始查询没有直接命中，但 expanded query 命中，结果会标注：

```text
Matched by expanded query: 智策星 端口
```

如果所有查询都无结果，返回 query plan 和建议，而不是静默空结果。

ContextGraph 已开始支持“经验关联源码路径”，但仍不把自己做成源码解析器。它从文档、handoff 和 session summary 中抽取文件路径、模块名和测试命令，建立：

- `RELATED_TO_FILE`：经验节点关联到源码文件或配置文件。
- `APPLIES_TO`：规则或风险适用于某个模块、目录或文件。
- `REQUIRES_TEST`：修改相关文件或模块后应运行的测试。

这样 Agent 可以查询“这个文件/模块相关的项目经验是什么”，同时继续把调用链、符号和实现关系交给 CodeGraph / LSP。

## Knowledge Domains

后续版本会引入 Knowledge Domain，把项目经验按任务领域组织，例如：

- `blockchain`
- `deployment`
- `testing`
- `frontend`
- `backend`

`query` / `brief` 会根据任务文本自动识别 domain，并优先召回该 domain 下的 P0/P1/P2 经验。P0 Rule 必须在结果中优先展示。

节点和边的状态语义会扩展为：

- `confirmed`：来自明确规约、人工记录、handoff、测试验证或可靠结构化抽取。
- `candidate`：自动抽取或 embedding 发现的候选事实，需要审阅。
- `deprecated`：旧文档或旧流程，不应作为当前依据。
- `conflict`：与其他规则或事实存在冲突。
- `stale`：来源已过期、Git HEAD 不一致或长时间未验证。

后续会增加 `supersedes` 关系，用于标记新文档、新 handoff 或新规则替代旧文档。

## Optional Embedding

Embedding 是可选能力，默认关闭，不作为 npm 包的硬依赖，也不会内置模型。启用后，ContextGraph 只在 `embedding rebuild` 阶段调用显式配置的 provider，并把结果缓存到本地 SQLite：

```bash
contextgraph embedding enable --provider openai-compatible-local-endpoint --model bge-m3 --endpoint http://127.0.0.1:11434/v1/embeddings
contextgraph embedding rebuild
contextgraph embedding status
```

当前 provider 边界：

- `none`：默认关闭。
- `openai-compatible-local-endpoint`：调用用户显式配置的本地兼容 endpoint。
- `ollama`：调用本机 Ollama embedding endpoint。
- `local-onnx`：预留接口，当前不打包模型。

Embedding 结果与 `block_hash` 绑定。block 未变化时，`embedding rebuild` 会跳过，不重复计算。provider 不可用时，基础 `query` 仍会回退到 FTS / 中文片段检索。

`query` 不会现场调用模型。它只读取已经缓存的 embedding 结果和候选语义边，在 FTS / trigram 命中后沿 `SEMANTICALLY_RELATED` 等 candidate edges 扩展上下文。

FTS finds text.
Embedding connects experience blocks.
Graph expansion gives agents the full project context.
Status tells whether the context is trustworthy.

## Optional Sources: API Contracts And Source Comments

ContextGraph 后续会增加两个可选索引来源，但它们不会改变产品边界：

Use CodeGraph for code facts.
Use ContextGraph for project experience facts.

Source comments and OpenAPI belong to ContextGraph only when they express project experience, operational constraints, interface contracts, risks, compatibility notes, or testing/deployment requirements.

### Swagger / OpenAPI

`v0.2.x` 已有首版 `api` preset，可把 OpenAPI / Swagger 文件纳入扫描来源：

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

OpenAPI / Swagger 是接口契约，适合纳入项目经验图谱。当前版本先把这些契约文件作为高价值来源纳入索引；后续解析器将提取 endpoint、method、path、request params、request body、response schema、tags 和 deprecated 状态，并生成：

- `ApiEndpoint`
- `ApiSchema`
- `ApiParameter`
- `ApiResponse`
- `ApiContract`

API 契约节点在 `query` / `brief` 中可以被召回，优先级高于普通 README 描述，因为它们通常比散落说明更接近接口事实来源。

### Source Comments

`v0.2.x / v0.3.x` 规划增加 `source-comments` preset：

```bash
contextgraph index --preset source-comments
```

Source Comments 只提取源码附近的高价值注释，不索引普通代码实现，不默认全量开启，不做调用链分析。首批语言规划覆盖 Java、JS、TS、Vue、Python 和 Go。

高价值注释关键词包括：必须、禁止、不能、不得、不要、注意、坑、兼容、历史、生产、部署、测试、回滚、风险、不能删除、不能修改、TODO、FIXME、HACK、deprecated、legacy、must、never、do not、warning、production。

SourceComment 会生成经验节点，并进一步分类为：

- `Rule`
- `Risk`
- `Failure`
- `Fix`
- `EnvironmentFact`
- `Decision`
- `CompatibilityNote`
- `Todo`
- `DeprecatedNote`

SourceComment 默认 `status=candidate`，`confidence=medium`，必须保留 source file 和 line range。查询结果必须明确显示来源是 `source_comment`，避免 Agent 把过期注释误认为 confirmed rule。

## Example: Blockchain Maintenance

A non-blockchain engineer maintaining blockchain integration across multiple clients uses ContextGraph to retrieve boundaries, endpoints, txid rules, deprecated docs, and failure modes before changing code.

在这个场景里，Agent 不应该只 grep 到一段 README 就开始改链上集成逻辑。它应该先通过 ContextGraph 获取：

- `P0 Rules`：哪些边界不能碰，例如 txid 规则、链上回执格式、客户侧隔离要求。
- `Current Source of Truth`：当前可信文档、handoff 或 verified note。
- `Environment Facts`：链服务地址、用途、来源、最近验证时间和状态。
- `Required Flow`：提交、轮询、回写、验证的必经步骤。
- `Required Tests`：改动后必须跑的测试或人工验收。
- `Deprecated Docs`：已被新文档或 handoff 替代的旧说明。
- `Known Failure Modes`：历史上发生过的超时、重复提交、txid 丢失、缓存误判等问题。
- `Related Files`：相关代码文件、配置文件和测试文件。

## Brief

`brief` 面向新 Agent 开工前阅读：

```bash
contextgraph brief
contextgraph brief --project /path/to/project
```

后续会把 `brief` 产品化为新 Agent 进入项目时的核心入口：

```bash
contextgraph brief --task "修改区块链附件上传"
contextgraph brief --file src/blockchain/upload.ts
contextgraph brief --domain blockchain
```

输出分组包括：

- `P0 Rules`
- `Current Source of Truth`
- `Environment Facts`
- `Required Flow`
- `Required Tests`
- `Deprecated Docs`
- `Known Failure Modes`
- `Related Files`

项目工具环境画像后续会从历史 session 导入中补齐，并进入 `Environment Facts`、`Required Flow` 和 `Required Tests` 等分组。

`brief` 的目标不是替代 `query`，而是在 Agent 开工前先给出可信的全局视野：

- P0 铁律
- 当前 source of truth
- 必须跑的测试
- 部署/环境警告
- 最近 handoff
- 过期/冲突信息
- 常见失败

## 安全策略

ContextGraph 默认 local-first：

- 不上传数据。
- 不调用远程 LLM。
- 不监听 TCP 端口。
- 默认忽略 `.env`、私钥、证书、依赖目录、构建产物、Git 内部文件和 `.contextgraph/graph.db`。
- 写入数据库前会脱敏疑似 API Key、Secret、Token、Password、Passphrase 和私钥区块。

## 后续路线：先可信，再语义

下一阶段目标不是立刻变重，而是先把 Level 0 的可信闭环做扎实，再逐层增强到语义上下文索引。Embedding 和 LLM 能力后置，避免模型能力掩盖基础状态、MCP 生命周期和查询结果字段的问题。

工程优先级：

1. `Level 0 Hardening`：MCP 长进程 reload / lazy refresh、MCP diagnostics、CLI/MCP 状态一致、watcher、status 拆 Context / Embedding / Extractor、query 结果字段稳定、中文 trigram / LIKE fallback 补强。
2. `Brief Productization`：把 `contextgraph brief` 做成新 Agent 开工入口，支持 `--task`、`--file`、`--domain`，输出 P0 铁律、source of truth、必跑测试、环境警告、最近 handoff、过期/冲突信息和常见失败。
3. `Experience-to-Source Association`：不解析 AST，只从文档/handoff/测试中抽文件路径、模块名和测试命令，建立 `RELATED_TO_FILE`、`APPLIES_TO`、`REQUIRES_TEST`，支持 `query --file` / `query --module`。
4. `Project Detector + Presets`：增加 `basic`、`project`、`api`、`source-comments`、`source`，让默认范围安全但不贫血，大范围 source 必须显式确认。
5. `Embedding`：已具备首版可选本地 embedding、缓存、candidate semantic edge discovery、query graph expansion 和 embedding status；后续增强 hybrid scoring 和 provider 生态。
6. `Local LLM Extractor`：可选本地 LLM 结构化抽取 Rule / Failure / Fix / Decision / TestRequirement / Risk / EnvironmentFact，支持 candidate -> confirmed 工作流。

- `Level 0 基础模式`：Markdown / JSON / Text parser、SQLite、FTS5、中文片段检索、status、query、MCP、handoff。未启用任何模型能力时，这一层必须独立可用。
- `Level 1 Embedding 模式`：在 Level 0 上增加可选本地 embedding、semantic search、hybrid search 和 candidate semantic edge discovery。embedding 不作为默认硬依赖。
- `Level 2 本地 LLM Extract 模式`：只对高价值 block、handoff、session summary 做结构化抽取，生成 Rule、Failure、Fix、Decision、TestRequirement、Risk。抽取结果默认是 `candidate`，不能直接当作 confirmed 规则。
- `Level 3 Governance 模式`：规则冲突检测、过期规则检测、修改前风险提示、required tests 推荐和 stale context warning。

FTS finds text. Embedding connects experience blocks. Graph expansion gives agents the full project context. Status tells whether the context is trustworthy.

在 embedding 阶段，ContextGraph 还会用向量关联这些经验块：

- 文档规则 ↔ 源码注释
- OpenAPI endpoint ↔ 测试脚本
- OpenAPI endpoint ↔ handoff 经验
- OpenAPI endpoint ↔ 环境配置

这些关系默认都是 candidate semantic edges，例如 `SEMANTICALLY_RELATED`、`MAY_APPLY_TO`、`POSSIBLY_REINFORCES` 和 `POSSIBLY_CONFLICTS`，不能直接当作 confirmed 规则或 confirmed 调用关系。

ContextGraph does not make agents better at grep. It removes the need for agents to guess the right grep query. Agents may ask in natural language; ContextGraph must turn that natural language into a reliable query plan, retrieve from multiple channels, expand through the experience graph, and return traceable, freshness-aware context.

所有模型能力都必须满足：

- 增量执行：`block_hash` 不变时不重新 embedding，不重新 LLM extract。
- 可缓存：embedding 和 extract 结果写入本地 SQLite，并绑定 block hash。
- 可跳过：未启用 provider 时，ContextGraph 仍可正常工作。
- 可降级：provider 不可用时自动降级到 FTS / 中文片段检索。
- 查询时不跑模型：`contextgraph query` 只能读取已有索引，不能现场调用 LLM。
- 本地优先：默认不联网、不上传、不调用远程 LLM。
- 模型不内置：npm 包不打包 embedding 模型或 LLM 模型。

详细阶段计划见 [ROADMAP.md](./ROADMAP.md)，后续开发设计见 [docs/dev-plan.md](./docs/dev-plan.md)。

当前 `0.1.x` 已开始补齐 Level 0 hardening：`status` 输出 Context / Embedding / Extractor 分层，MCP tool 每次调用都会重新检查本地 `.contextgraph` 状态，并提供 `diagnose_contextgraph` 和 `reload_contextgraph`。`contextgraph watch` 已支持本地文件监听和自动重建索引，不联网、不起 TCP 服务。下一步继续补 brief 产品化、源码路径/模块/测试命令关联，以及谨慎的 preset 体系，避免默认索引过窄或源码索引失控。

## Watch

启动本地 watcher：

```bash
contextgraph watch
contextgraph watch --debounce 500
```

Watcher 只监听当前配置命中的本地 source 文件。文件变化后会在 debounce 窗口结束后运行本地 `index`，并把 watcher 状态写入 `.contextgraph/watcher.json`，供 `contextgraph status` 显示。

边界：

- 不联网。
- 不启动 TCP 服务。
- 不调用模型。
- 不扫描未配置的大范围源码。
- 不替代 IDE / LSP / CodeGraph 的代码索引。

## MCP

启动 MCP Server：

```bash
contextgraph mcp
```

指定项目根目录：

```bash
contextgraph mcp --project /path/to/project
```

stdio MCP 配置可以使用同一个全局命令：

```json
{
  "command": "contextgraph",
  "args": ["mcp", "--project", "/path/to/project"]
}
```

MCP 暴露这些工具：

- `get_context_status`
- `diagnose_contextgraph`
- `reload_contextgraph`
- `get_relevant_context`

MCP 使用 stdio。每次 tool 调用都会 lazy refresh 本地配置和数据库状态，避免长进程把启动时的未初始化状态缓存成永久状态。`diagnose_contextgraph` 会返回 `projectRoot`、`configPath`、`dbPath`、初始化状态、索引状态、`lastIndexedAt` 和下一步建议。

## MVP 限制

第一版不包含历史 session 导入、embedding、向量数据库、远程 LLM 抽取、规则冲突检测、UI、VS Code 扩展、Codex 侧边栏、云同步或团队权限。

历史 session 导入是必做的 Phase 2。它应该通过显式、脱敏、可审计、摘要优先的流程导入现有项目相关 Codex sessions，让已有项目初始化后立刻有可查询的历史经验。

Phase 2 还必须建立项目工具环境画像。它要从历史 sessions 和本地配置中抽取这个项目常用或曾经失败的 MCP servers、skills、插件/连接器、浏览器/Playwright 自动化、文档/PDF/表格工具和测试工具，让新 Agent 能知道开工前该加载哪些能力。

## License

License: Apache-2.0. See [LICENSE](LICENSE).
