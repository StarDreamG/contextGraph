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

Query results must show source, type, confidence/status, and freshness. Status and freshness are part of the trust layer, not optional display.

## 它是什么

ContextGraph 是面向 AI Coding Agent 的本地项目经验索引。它参考 CodeGraph 的“预索引、可查询、可溯源”思想，但索引对象不是源码，而是 README、AGENTS.md、CLAUDE.md、docs、handoff、session summary 和团队经验记录中面向 Agent 的项目知识。

它的根目的是避免 Agent 只用 `grep` / `rg` / `read` 抓到 README 或局部文档后，就把局部事实误判成项目全貌。ContextGraph 预索引的是 agent-facing project experience，让新 Agent 在动手前先看到规约、历史经验、测试要求、部署注意事项和工具环境，而不是从零试探。

ContextGraph 不和 CodeGraph 抢同一层：

- CodeGraph / Sourcegraph / LSP / IDE indexes 适合处理代码事实：类、函数、符号引用、调用链、接口实现和模块依赖。
- ContextGraph 处理项目经验事实：agent 指令、团队规约、历史踩坑、修复经验、测试要求、部署约束、handoff、决策、环境说明和模型/agent 使用约定。

AGENTS.md 是 Agent 的入口说明，ContextGraph 是入口背后的经验索引和全局视图。Agent 可以先读 AGENTS.md 获得开工约束，再通过 ContextGraph 查询当前任务相关的经验事实、新鲜度和优先级。

## 它不是什么

ContextGraph 不是 source-code knowledge graph，不替代 CodeGraph、Sourcegraph、LSP、IDE 索引或 tree-sitter 级源码解析。它不负责回答“这个方法有哪些调用方”“这个 Spring Bean 怎么注入”“这个 interface 有哪些实现”这类代码结构问题。

ContextGraph 也不是 Markdown 文档管理器、云知识库、向量数据库、远程 LLM 包装器或 UI 优先的文档产品。

第一版不会上传任何数据，不会调用远程 LLM，不会打开网络端口。

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
contextgraph index
contextgraph status
contextgraph doctor
contextgraph brief
contextgraph query "测试"
contextgraph handoff --agent codex --task "实现功能" --summary "完成实现，已运行 npm test" --files "src/example.ts"
```

包入口不绑定本机绝对路径，会优先使用安装目录同级的 Node.js，减少全局安装 Node 与当前项目目录 Node 不一致导致的原生模块 ABI 问题。发布前通过 `npm pack --dry-run` 检查包内容。本地 `npm link` 后，后续迭代只需要在本仓库运行 `npm run build`，全局 `contextgraph` 命令会继续指向最新构建产物。

也可以不 link，直接使用仓库内 npm script：

```bash
npm run contextgraph -- status
```

## 命令

- `init`：创建 `.contextgraph`、`graph.db`、配置、状态文件和 AGENTS.md 指引。
- `index`：扫描配置的 sources，脱敏内容，生成 blocks、nodes、FTS 和状态。
- `status`：显示新鲜度和可信度。
- `doctor`：检查 Node、SQLite 原生依赖、项目初始化状态和索引健康度。
- `brief`：为新 Agent 输出最高优先级的开工摘要。
- `query`：搜索相关项目上下文。
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

查询结果会优先返回高优先级节点，并显示 `Priority` 和原因。

后续会补强“经验关联源码”的能力，但仍不把 ContextGraph 做成源码解析器。目标是从文档、handoff 和 session summary 中抽取文件路径、模块名和测试命令，建立：

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

后续会支持 task-aware brief：

```bash
contextgraph brief "维护多客户区块链集成"
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

## 安全策略

ContextGraph 默认 local-first：

- 不上传数据。
- 不调用远程 LLM。
- 不监听 TCP 端口。
- 默认忽略 `.env`、私钥、证书、依赖目录、构建产物、Git 内部文件和 `.contextgraph/graph.db`。
- 写入数据库前会脱敏疑似 API Key、Secret、Token、Password、Passphrase 和私钥区块。

## 后续路线：语义上下文索引

下一阶段目标是从关键词索引升级为语义上下文索引，但继续保持轻量、可选、可降级。

- `Level 0 基础模式`：Markdown / JSON / Text parser、SQLite、FTS5、中文片段检索、status、query、MCP、handoff。未启用任何模型能力时，这一层必须独立可用。
- `Level 1 Embedding 模式`：在 Level 0 上增加可选本地 embedding、semantic search、hybrid search 和 candidate semantic edge discovery。embedding 不作为默认硬依赖。
- `Level 2 本地 LLM Extract 模式`：只对高价值 block、handoff、session summary 做结构化抽取，生成 Rule、Failure、Fix、Decision、TestRequirement、Risk。抽取结果默认是 `candidate`，不能直接当作 confirmed 规则。
- `Level 3 Governance 模式`：规则冲突检测、过期规则检测、修改前风险提示、required tests 推荐和 stale context warning。

FTS finds text. Embedding connects experience blocks. Graph expansion gives agents the full project context. Status tells whether the context is trustworthy.

所有模型能力都必须满足：

- 增量执行：`block_hash` 不变时不重新 embedding，不重新 LLM extract。
- 可缓存：embedding 和 extract 结果写入本地 SQLite，并绑定 block hash。
- 可跳过：未启用 provider 时，ContextGraph 仍可正常工作。
- 可降级：provider 不可用时自动降级到 FTS / 中文片段检索。
- 查询时不跑模型：`contextgraph query` 只能读取已有索引，不能现场调用 LLM。
- 本地优先：默认不联网、不上传、不调用远程 LLM。
- 模型不内置：npm 包不打包 embedding 模型或 LLM 模型。

详细阶段计划见 [ROADMAP.md](./ROADMAP.md)，后续开发设计见 [docs/dev-plan.md](./docs/dev-plan.md)。

下一阶段会优先补齐真实试用中暴露的基础体验：MCP 长进程状态刷新、`reload_contextgraph`、更清晰的 MCP 诊断、项目类型自动识别、源码路径/模块/测试命令关联，以及 `basic` / `project` / `source` 索引 preset，避免默认索引过窄或源码索引失控。

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

MVP 暴露两个工具：

- `get_context_status`
- `get_relevant_context`

MCP 使用 stdio。日志和诊断信息写入 stderr，stdout 保留给 MCP 协议消息。

## MVP 限制

第一版不包含 watch 模式、历史 session 导入、embedding、向量数据库、远程 LLM 抽取、规则冲突检测、UI、VS Code 扩展、Codex 侧边栏、云同步或团队权限。

历史 session 导入是必做的 Phase 2。它应该通过显式、脱敏、可审计、摘要优先的流程导入现有项目相关 Codex sessions，让已有项目初始化后立刻有可查询的历史经验。

Phase 2 还必须建立项目工具环境画像。它要从历史 sessions 和本地配置中抽取这个项目常用或曾经失败的 MCP servers、skills、插件/连接器、浏览器/Playwright 自动化、文档/PDF/表格工具和测试工具，让新 Agent 能知道开工前该加载哪些能力。

## License

License: Apache-2.0. See [LICENSE](LICENSE).
