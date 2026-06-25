# 0003 NPM Package Prep and Agent Brief

## Background

ContextGraph 已经能通过本机 `npm link` 使用，并具备 priority、edges、doctor 和 MCP project 参数。但当前包仍是本机开发形态：包名未 scope 化、`private: true`、bin wrapper 绑定本机 Node 路径。新 Agent 也还缺少一个开工前可直接阅读的摘要视图。

## User story

作为其他开发者或新 Agent，我希望能通过 `@stardreamg/contextgraph` 的 npm 包形态安装工具，并能运行 `contextgraph brief` 快速看到项目最重要的规约、必跑流程、踩坑经验和项目形态。

## Scope

- 将包名改为 `@stardreamg/contextgraph`。
- 移除 npm 发布阻断项，加入 publish/package metadata。
- 将 `bin/contextgraph` 改为通用 Node wrapper，不再硬编码本机 Node 路径。
- 增加 `files`、`prepack` 和 `publishConfig.access=public`。
- 增加 `contextgraph brief` 命令。
- brief 按 priority 和类型输出：
  - P0 Must Know
  - P1 Required Workflow
  - P1 Known Pitfalls
  - P2 Project Shape
  - Tool Profile 占位
- 更新 README，说明 npm 安装、npx 使用、brief 和 MCP 配置。

## Out of scope

- 不执行真实 npm publish。
- 不实现历史 session 导入。
- 不实现完整项目工具环境画像。
- 不改变 SQLite schema。

## Acceptance criteria

- [ ] `package.json` 包名为 `@stardreamg/contextgraph`。
- [ ] `npm pack --dry-run` 可执行并包含 `dist`、`bin`、README 和 package metadata。
- [ ] 安装包 bin 使用通用 `node`，不包含本机绝对 Node 路径。
- [ ] `contextgraph brief` 能输出 P0/P1/P2 分组。
- [ ] brief 中 P0 规则排在普通说明前。
- [ ] README 包含 `npm install -g @stardreamg/contextgraph` 和 `npx @stardreamg/contextgraph` 示例。
- [ ] `npm run build && npm run check && npm test` 通过。

## Technical notes

- brief 初版直接从现有 nodes/metadata/priority 读取，不新增表。
- Tool Profile 在本阶段只显示未导入状态，后续由 session import 和 tool profile 阶段填充。

## Risks

- 发布包入口如果仍依赖本机路径，其他机器无法使用。
- scoped package 默认 npm publish 可能变成 private，需要 `publishConfig.access=public`。
- brief 初版要避免过度承诺工具画像能力。
