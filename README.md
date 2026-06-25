# ContextGraph

ContextGraph is a local-first context graph for coding agents.
Markdown files are sources.
Agent sessions are sources.
Git history is a source.
Test commands are sources.
The graph is the interface.
The status is the trust layer.
MCP is the agent protocol.

## 它是什么

ContextGraph 是面向 AI Coding Agent 的本地上下文图谱工具。它把项目规约、流程、命令、测试、决策、失败记录、修复方案、环境说明、偏好和 Agent handoff 摘要索引到本地 SQLite 图谱中。

它的目标不是替代 CodeGraph。CodeGraph 更适合预索引代码结构；ContextGraph 预索引的是项目经验和执行上下文。

## 它不是什么

ContextGraph 不是 Markdown 文档管理器、云知识库、向量数据库、远程 LLM 包装器，也不是 UI 优先的文档产品。

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

## Brief

`brief` 面向新 Agent 开工前阅读：

```bash
contextgraph brief
contextgraph brief --project /path/to/project
```

输出分组包括：

- `P0 Must Know`
- `P1 Required Workflow`
- `P1 Known Pitfalls`
- `P2 Project Shape`
- `Tool Profile`

当前 `Tool Profile` 仍是占位信息，后续由历史 session 导入和项目工具环境画像填充。

## 安全策略

ContextGraph 默认 local-first：

- 不上传数据。
- 不调用远程 LLM。
- 不监听 TCP 端口。
- 默认忽略 `.env`、私钥、证书、依赖目录、构建产物、Git 内部文件和 `.contextgraph/graph.db`。
- 写入数据库前会脱敏疑似 API Key、Secret、Token、Password、Passphrase 和私钥区块。

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
# contextGraph

contextGraph 是一个项目上下文记录和跨项目、跨 Agent 共享的底层工具，目的是在 AI 编程和自动化流程中记录和保留项目信息，使不同的 AI Agent 甚至不同的模型之间也能延续一个项目的上下文。

## 目标

- 持久化项目背景、环境变量、部署配置、关键决策等信息，以图谱形式保存。
- 支持多个 AI Agent 共享同一项目的上下文，避免重复沟通。
- 导入和导出历史会话内容，方便长周期任务和中断后恢复。
- 与自动化部署流程打通，让原型转换为可上线产品时自动生成配置信息。

## 分阶段计划

1. **阶段1**：构建核心数据结构，提供最小命令行工具，用于初始化和更新项目上下文。
2. **阶段2**：支持导入历史对话内容，适配多个 AI Agent，提供图谱可视化。
3. **阶段3**：与自动部署平台整合，在需要切换模型或 Agent 时自动接续项目上下文。

## 使用方法

项目处于早期开发阶段，更多设计思路和计划请参见 [docs](./docs/) 目录。

## 贡献

欢迎任何形式的贡献！如果你希望参与讨论或提交代码，请先通过 Issues 或 Pull Request 联系我们。

## 许可证

本项目使用 MIT 许可证，详见 [LICENSE](LICENSE)。
