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

## 本地运行

在本仓库内安装依赖并构建：

```bash
npm install
npm run build
```

通过仓库内 npm script 运行：

```bash
npm run contextgraph -- init
npm run contextgraph -- index
npm run contextgraph -- status
npm run contextgraph -- query "测试"
npm run contextgraph -- handoff --agent codex --task "实现功能" --summary "完成实现，已运行 npm test" --files "src/example.ts"
```

不需要全局安装 npm 包，也不需要 `npm link`。

## 命令

- `init`：创建 `.contextgraph`、`graph.db`、配置、状态文件和 AGENTS.md 指引。
- `index`：扫描配置的 sources，脱敏内容，生成 blocks、nodes、FTS 和状态。
- `status`：显示新鲜度和可信度。
- `query`：搜索相关项目上下文。
- `handoff`：记录 Agent 会话交接摘要。
- `mcp`：启动本地 stdio MCP Server。

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
npm run contextgraph -- mcp
```

MVP 暴露两个工具：

- `get_context_status`
- `get_relevant_context`

MCP 使用 stdio。日志和诊断信息写入 stderr，stdout 保留给 MCP 协议消息。

## MVP 限制

第一版不包含 watch 模式、历史 session 导入、embedding、向量数据库、远程 LLM 抽取、规则冲突检测、UI、VS Code 扩展、Codex 侧边栏、云同步或团队权限。

历史 session 导入是必做的 Phase 2。它应该通过显式、脱敏、可审计、摘要优先的流程导入现有项目相关 Codex sessions，让已有项目初始化后立刻有可查询的历史经验。
