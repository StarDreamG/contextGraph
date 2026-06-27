# ContextGraph MVP 设计规格

## 状态

已于 2026-06-15 确认。

## 背景

编程 Agent 经常需要重复扫描项目文件，重新发现项目规约、命令、测试、决策、失败记录、修复方案和环境知识。这会消耗大量工具调用与 Token，不同 Agent 还可能得到不一致的结论。

ContextGraph 将稳定的项目上下文预先索引到本地图谱中，并通过 CLI 和 MCP 对外提供。Markdown 等项目文件是输入源，图谱是查询接口，状态是信任层。

## 用户故事

作为编程 Agent 或开发者，我希望在本地索引和查询项目知识，从而基于统一、最新、可追溯的上下文开始工作，而不是每次都从文件检索开始。

## MVP 目标

交付一条可运行的本地闭环：

`init -> index -> status -> query -> handoff -> mcp`

通过 `npm run contextgraph -- <command>` 在仓库内运行。无需全局安装 npm 包、Docker、远程服务或远程语言模型。

## 范围

- 使用 TypeScript 开发 CLI，最低运行环境为 Node.js 22 LTS。
- 使用 `better-sqlite3` 管理 SQLite，并启用 FTS5。
- 通过 npm scripts 在仓库内运行。
- 实现 `init`、`index`、`status`、`query`、`handoff` 和 `mcp`。
- 支持 Markdown、JSON 和普通文本源文件。
- 使用内容哈希生成稳定语义块，并支持增量更新。
- 使用确定性的规则分类语义节点。
- 基于 Git HEAD 与工作区文件变化计算索引新鲜度。
- 在写入数据库前排除敏感文件并脱敏敏感内容。
- MCP 首期提供 `get_context_status` 和 `get_relevant_context`。
- 提供自动化测试和面向用户的 README。

## 非目标

- Watch 模式。
- 云同步、团队权限或远程存储。
- 远程 LLM 调用或自动读取 Agent 私有记忆。
- Embedding 或向量数据库。
- 规则冲突检测或基于 LLM 的语义抽取。
- Web UI、图谱可视化、编辑器扩展或侧边栏。
- 将全局 npm 安装或 `npm link` 作为主要使用方式。
- 存量历史 Agent session 导入不属于 MVP，但它是第二阶段必做能力，不得在后续路线中删除。

Note: Watch 模式不属于 2026-06-15 的原始 MVP 范围，但已在后续 `0.1.x` Level 0 hardening 中实现首版 `contextgraph watch`。

## 第二阶段必做：存量 Session 导入

MVP 只记录从 `contextgraph handoff` 开始的新会话摘要，因此它能证明闭环，但不能完全解决“已有项目开箱即用”的问题。第二阶段必须加入存量 Agent session 导入，尤其是本机 Codex 历史 session。

该能力的产品目标是：用户在一个已有项目中初始化 ContextGraph 后，可以把过去已经发生过的调试、修复、测试、部署和决策经验转化为可查询图谱，而不是从零积累 handoff。

第二阶段还必须建立“项目工具环境画像”。新 Agent 不只需要知道项目规约和历史修复，也需要知道这个项目过去依赖哪些 MCP server、skills、插件/连接器和自动化工具。否则它仍要重新试探工具环境，开箱即用价值会打折。

第二阶段边界：

- 提供显式命令，例如 `contextgraph import-sessions`。
- 默认只导入与当前项目有关的 session，项目归属依据包括工作目录、文件路径、Git remote、项目名和任务上下文。
- 导入前提供 dry-run 统计，展示候选 session 数量、时间范围、估算体积、匹配原因和风险提示。
- 导入内容先脱敏，再摘要化为 `AgentSession`、`Failure`、`Fix`、`Decision`、`Test`、`Command`、`Environment` 或 `Note` 节点。
- 从历史 session 和本地配置中抽取工具能力节点，至少覆盖 MCP server、skills、插件/连接器、浏览器/Playwright 自动化、文档/PDF/表格处理能力和测试工具。
- 工具能力节点要记录工具名称、类型、适用任务、项目关联证据、最近使用时间、成功/失败记录、置信度和来源 session。
- `contextgraph query` 和 MCP 查询必须能回答“这个项目开始工作前应该加载哪些工具/skills/MCP server”。
- `contextgraph status` 或后续专门命令要能显示工具环境画像是否存在、是否来自过期 session、是否缺少关键工具线索。
- 原始长对话不得默认全文写入图谱；如需保存原文引用，必须保存来源指针和摘要，并明确标记隐私风险。
- 支持按时间范围增量导入，例如最近 7 天、30 天或指定日期之后。
- 每次导入要记录状态、失败项、跳过项和可审计日志。
- 不得自动跨项目读取所有私有记忆；跨项目或全量历史导入必须由用户显式授权。

## 架构

实现按职责拆分为以下模块：

1. **CLI 层**：解析命令并格式化面向用户的输出。
2. **核心服务层**：实现初始化、索引、状态、查询和 handoff，且不依赖 CLI。
3. **解析与分类层**：将支持的源文件转换为稳定语义块和确定性语义节点。
4. **存储层**：负责 SQLite 建表、事务、FTS 同步和持久化。
5. **适配器层**：隔离文件系统扫描、Git 状态读取和 MCP 传输。

核心服务返回结构化数据，CLI 和 MCP 作为两个独立调用方复用同一套服务与数据库，避免命令行输出逻辑渗透到索引和查询实现中。

## 项目结构

```text
src/
  cli/
  commands/
  config/
  core/
  git/
  indexing/
  mcp/
  parsing/
  security/
  storage/
  types/
tests/
  fixtures/
  integration/
  unit/
```

文件按单一职责组织。共享领域类型放入 `src/types`，不得把主要行为集中到一个大型 CLI 文件中。

## 初始化

`contextgraph init` 定位当前项目根目录并创建：

```text
.contextgraph/
  graph.db
  config.json
  status.json
  sessions/
  logs/
  snapshots/
```

命令同时创建或更新 `AGENTS.md`。如果文件已经存在，只追加一个带清晰边界标记的 ContextGraph 指引区块，不覆盖现有内容。重复执行 `init` 不得重复追加该区块。

默认配置包括源文件 glob、忽略 glob、Schema 版本、项目名称和离线隐私策略。默认忽略 `.env`、私钥、证书、构建产物、依赖目录、Git 内部文件和 ContextGraph 自身的 SQLite 数据库。

## 存储模型

SQLite 包含以下表：

- `sources`：索引文件、文件哈希、Git HEAD、时间戳和元数据。
- `blocks`：带行号范围和哈希的稳定源文件片段。
- `nodes`：关联源文件与语义块的分类知识节点。
- `edges`：带类型的图谱关系。
- `sessions`：已记录的 Agent handoff。
- `status`：持久化的索引状态与可信度。
- `nodes_fts`：针对节点标题和内容的 FTS5 索引。

数据库启用外键。索引更新在事务内执行。节点的新增、修改和删除必须在同一事务内同步到 `nodes_fts`。

在可行范围内使用确定性 ID：

- Source ID 由标准化的项目相对路径生成。
- Block ID 由 Source ID 和稳定语义块位置生成。
- 自动生成的 Node ID 由 Block ID、节点类型和内容哈希生成。

## 解析与分类

Markdown 按标题章节切块，Frontmatter 作为元数据而不是正文。JSON 按顶层 Key Path 切块，普通文本按非空段落切块。

每个 Block 记录源路径、类型、标题、内容、哈希和行号范围。不支持或格式错误的单个文件计入失败项，但不得中止整个索引过程。

MVP 支持以下节点类型：

`Rule`、`Workflow`、`Command`、`Test`、`Decision`、`Failure`、`Fix`、`Environment`、`Preference`、`Note`、`AgentSession` 和 `File`。

分类规则采用明确优先级，避免宽泛规则覆盖更具体的类型。例如先识别命令和测试，再识别通用规则和笔记。一个 Block 如果包含多个相互独立且有价值的类别，可以生成多个节点。MVP 不调用 LLM 做推断。

## 增量索引

`contextgraph index` 执行以下步骤：

1. 读取并校验 `.contextgraph/config.json`。
2. 解析配置的源文件 glob 并应用忽略规则。
3. 在读取内容前拒绝敏感路径。
4. 计算每个 Source 的哈希。
5. 跳过没有变化的 Source。
6. 将变化的 Source 解析为 Block。
7. 按哈希复用未变化的 Block，并替换变化 Block 对应的节点。
8. 删除已经不存在的 Source 及其关联记录。
9. 在同一事务内更新 FTS 和聚合状态。
10. 保存当前 Git HEAD 和工作区快照。

命令输出扫描及变化的 Source 数量、Block 和 Node 变化数量、Git HEAD、索引时间以及最终状态。

## 信任状态

`contextgraph status` 必须根据当前项目状态实时计算结果，不能只相信上次写入的 JSON。需要比较：

- 数据库是否存在，以及上次索引是否成功。
- 当前 Git HEAD 与已索引 Git HEAD。
- 当前 Source 哈希与已索引 Source 哈希。
- 新增、删除或新匹配到的源文件。
- 失败 Block 数量。

可信度规则：

- **High**：索引存在、HEAD 一致、Source 集合及哈希一致，且没有失败 Block。
- **Medium**：HEAD 和源文件内容一致，但存在非致命警告或失败 Block。
- **Low**：数据库不存在、上次索引失败、HEAD 不一致，或 Source 内容及集合发生变化。

当已索引内容与当前项目一致，且可信度为 High 或 Medium 时，状态为 `Fresh`；否则为 `Stale`。因此，即使没有提交，仅修改 `AGENTS.md` 也必须让状态变为 `Stale`。

索引完成后，状态同时写入 `.contextgraph/status.json` 和 SQLite `status` 表。MCP 进程状态等运行时信息在可确定时展示，但不影响内容新鲜度。

## 查询

`contextgraph query "<task>"` 使用 `nodes_fts` 搜索，通过 FTS5 对结果排序，并返回：

- 节点类型。
- 标题。
- 内容摘要。
- 源文件路径和行号范围。
- 置信度。
- 节点状态。

输出始终包含图谱状态和可信度。索引过期时仍允许查询，但必须在顶部明确警告。空查询或包含 FTS 特殊语法的查询应返回可操作的校验信息，不得直接暴露 SQLite 错误。

## Handoff

`contextgraph handoff` 接收：

- `--agent`。
- `--task`。
- `--summary`。
- 可选的逗号分隔 `--files`。

命令写入一条 `sessions` 记录和一个 `AgentSession` 节点。根据确定性规则从摘要中提取关联的 `Failure`、`Fix`、`Test` 或 `Note` 节点。通过 Edge 连接 Session、当前 Git HEAD 元数据、引用文件和产出节点。引用文件路径经过标准化后，以项目相对路径保存。

## MCP

`contextgraph mcp` 通过 stdio 启动 MCP Server，与 CLI 共用核心服务和数据库。日志不得写入 stdout，因为 stdout 用于传输 MCP 协议消息。

MVP 提供：

- `get_context_status`：返回结构化的新鲜度、可信度、时间戳、Git HEAD 和节点数量。
- `get_relevant_context`：接收任务描述和可选文件路径，返回经过排序的相关节点、来源证据和状态警告。

MCP Server 不发起网络请求，也不监听 TCP 端口。

## 安全

ContextGraph 默认离线，不包含远程传输能力。

安全措施分为两层：

1. 路径过滤：在读取文件前排除配置和内置规则匹配到的敏感文件名及密钥材料。
2. 内容脱敏：在计算 Block 哈希、生成节点、写日志、状态详情或数据库前，将疑似 API Key、Secret、Token、Password、Passphrase 和私钥区块替换为 `[REDACTED_SECRET]`。

错误信息不得回显未脱敏的源文件内容。MVP 的配置校验不允许关闭离线模式或启用远程 LLM。

## 错误处理

- 命令失败时返回非零退出码和简洁的修复建议。
- 除 `init` 外的命令在项目尚未初始化时应明确说明。
- 配置无效时输出具体字段的校验错误。
- 单个源文件格式错误时记录失败并继续处理其他文件。
- 数据库迁移和索引更新使用事务。
- MCP 将领域错误转换为符合协议的 Tool Error。

## 测试

测试使用临时 Git 仓库和临时项目目录，不能修改当前仓库或其他本地项目。

必须覆盖：

- `init` 创建本地目录、配置、数据库、状态文件和幂等的 `AGENTS.md` 指引。
- Markdown 被扫描并按标题切块，行号范围正确。
- JSON 和普通文本生成稳定 Block。
- Rule、Command 和 Test 能被正确分类。
- 未变化文件被跳过，变化或删除的 Source 被正确更新。
- Status 能识别 Fresh、Git HEAD 变化和未提交的源文件变化。
- Query 能返回 FTS 结果，并在 Stale 时警告。
- Handoff 能创建 Session、节点和关系。
- 敏感文件被跳过，敏感内容被脱敏。
- MCP 通过 stdio 启动，两个必需 Tool 返回合法结构化数据。

完成门槛为 `npm test`、类型检查和生产构建全部通过。

## 文档

README 首屏必须包含以下产品说明：

> ContextGraph is a local-first context graph for coding agents.
> Markdown files are sources. Agent sessions are sources. Git history is a
> source. Test commands are sources. The graph is the interface. The status is
> the trust layer. MCP is the agent protocol.

README 需说明安装方式、仓库内命令用法、完整 MVP 流程、本地优先安全策略、MCP 配置和当前限制。

## 交付与仓库约束

- 所有开发在当前仓库内完成，并通过 npm 运行。
- 不安装全局 npm 包。
- MVP 不需要 Docker。后续若引入 Docker，必须隔离 Compose Project、容器名、Volume、Network 和端口。
- 仓库级 Git 身份为 `StarDreamG <StarDreamG@users.noreply.github.com>`。
- 未来远端必须属于 `github.com/StarDreamG`，本仓库禁止使用 GitLab 远端或凭据。
- 非简单实现必须来源于规范化 Issue。在 GitHub 远端和认证工具可用前，本规格作为本地权威任务描述；首次发布实现前必须创建内容对应的 GitHub Issue。

## 验收标准

1. 在空项目中可以成功运行 `init`。
2. 索引 `AGENTS.md` 后能够创建并填充 `graph.db`。
3. Status 能显示新鲜度、可信度、最后索引时间、当前 HEAD 和已索引 HEAD。
4. 修改配置包含的源文件但不重新索引时，Status 变为 `Stale`。
5. 重新索引后恢复 `Fresh`。
6. 查询测试相关上下文时，返回带来源证据的 `Test`、`Rule` 或 `Command` 节点。
7. Handoff 能记录 Session 和相关图谱节点。
8. MCP 能通过 stdio 启动并提供两个必需 Tool。
9. Secret 不会以明文持久化。
10. 测试、类型检查和构建全部通过。
11. 新用户仅通过 README 即可在不全局安装的情况下跑通流程。

## 风险与缓解措施

- **SQLite 原生依赖安装失败**：锁定兼容 Node.js 22 的 `better-sqlite3` 版本，并在 CI 中验证全新安装。
- **新鲜度误判**：Status 执行时计算当前工作区 Source 哈希，不只比较 Git HEAD。
- **FTS 查询语法错误**：清洗或引用用户查询词，并测试标点符号与多语言输入。
- **过度分类**：保持确定性的优先级，并保留来源证据供用户判断。
- **Secret 泄漏**：尽可能在读取前过滤，并在所有持久化边界前脱敏。
- **MCP 协议被日志破坏**：stdout 仅用于协议消息，诊断信息写入 stderr。
