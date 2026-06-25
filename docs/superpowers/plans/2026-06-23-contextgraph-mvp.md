# ContextGraph MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个仓库内运行的 ContextGraph MVP，跑通 `init -> index -> status -> query -> handoff -> mcp` 本地闭环。

**Architecture:** 使用 TypeScript 分层实现 CLI、核心服务、解析分类、SQLite 存储、Git/文件系统适配器和 MCP stdio Server。CLI 与 MCP 共用同一套核心服务和 `.contextgraph/graph.db`，所有索引写入经过脱敏和事务边界。

**Tech Stack:** Node.js 22 LTS 兼容范围、TypeScript、commander、better-sqlite3、fast-glob、gray-matter、zod、@modelcontextprotocol/sdk、Vitest。

---

## 执行约束

- 使用仓库级 Git 身份：`StarDreamG <StarDreamG@users.noreply.github.com>`。
- 不配置 GitLab remote，不 push，不使用全局 npm 安装，不使用 `npm link`。
- 依赖只写入本仓库 `package.json` 和 lockfile，通过 `npm install` 安装到本仓库 `node_modules`。
- 当前实现不使用 Docker。若测试需要隔离项目，使用 Node 临时目录和临时 Git 仓库。
- 写实现代码前执行 `superpowers:test-driven-development`；遇到失败或异常时执行 `superpowers:systematic-debugging`；声明完成前执行 `superpowers:verification-before-completion`。
- MVP 不实现存量历史 session 导入，但文档和本地 Issue 必须明确：Phase 2 必须实现 `import-sessions`，这是已有项目开箱即用的关键能力。
- MVP 不实现项目工具环境画像，但文档必须明确：Phase 2 要从历史 session 中抽取该项目常用 MCP server、skills、插件/连接器和自动化工具，否则新 Agent 仍无法真正开箱即用。

## Phase 2 必做约束

MVP 结束后的下一阶段必须实现存量 Agent session 导入，优先支持本机 Codex 历史 session。该能力不是可选增强项，而是 ContextGraph 在多项目、多 Agent 环境中开箱即用的核心条件。

Phase 2 设计必须满足：

- 显式命令入口，例如 `contextgraph import-sessions`。
- 支持 dry-run，导入前展示候选 session 数量、时间范围、估算体积、匹配项目原因和隐私风险。
- 默认只导入与当前项目相关的 session，匹配依据包括工作目录、文件路径、Git remote、项目名和任务上下文。
- 导入前先脱敏，导入时默认保存摘要节点和来源指针，不默认把原始长对话全文写入图谱。
- 从导入 session 和本地配置中抽取项目工具环境画像，至少覆盖 MCP server、skills、插件/连接器、浏览器/Playwright 自动化、文档/PDF/表格处理能力和测试工具。
- 工具环境画像必须记录工具名称、类型、适用任务、项目关联证据、最近使用时间、成功/失败记录、置信度和来源 session。
- Query/MCP 必须能回答“这个项目开始工作前应该加载哪些工具、skills 或 MCP server”。
- Status 或专门命令必须能显示工具环境画像是否存在、是否过期、是否缺少关键线索。
- 支持时间范围和增量导入，例如最近 7 天、30 天或指定日期之后。
- 记录导入状态、失败项、跳过项和可审计日志。
- 跨项目或全量私有历史导入必须由用户显式授权。

## 文件结构与职责

- `package.json`：npm scripts、依赖、Node 版本范围、bin 入口。
- `tsconfig.json`：TypeScript 编译配置。
- `vitest.config.ts`：测试配置。
- `src/cli/main.ts`：CLI 入口，只负责命令注册和退出码。
- `src/commands/*.ts`：命令级输出格式化和参数解析。
- `src/types/domain.ts`：配置、状态、Source、Block、Node、Edge、Session 类型。
- `src/config/defaults.ts`：默认配置和 AGENTS.md 指引文本。
- `src/config/loadConfig.ts`：读取与校验 `.contextgraph/config.json`。
- `src/security/redaction.ts`：敏感路径识别与内容脱敏。
- `src/git/gitState.ts`：当前 HEAD、工作区状态、Git 可用性。
- `src/storage/database.ts`：打开 SQLite、启用外键、事务工具。
- `src/storage/schema.ts`：建表、FTS5、基础索引。
- `src/storage/repositories.ts`：Source、Block、Node、Edge、Session、Status 读写。
- `src/parsing/markdown.ts`：Markdown Frontmatter 与标题切块。
- `src/parsing/json.ts`：JSON 顶层 Key Path 切块。
- `src/parsing/text.ts`：普通文本段落切块。
- `src/indexing/classifier.ts`：规则分类 Block 到 Node。
- `src/indexing/scanner.ts`：按配置扫描源文件并应用 ignore。
- `src/core/initService.ts`：创建 `.contextgraph`、数据库、配置、状态和 AGENTS.md 指引。
- `src/core/indexService.ts`：增量索引和状态写入。
- `src/core/statusService.ts`：实时计算 Fresh/Stale 与可信度。
- `src/core/queryService.ts`：FTS 查询和结果格式。
- `src/core/handoffService.ts`：Session 写入和 handoff 节点关系。
- `src/mcp/server.ts`：stdio MCP Server 和两个工具。
- `tests/helpers/project.ts`：临时项目、临时 Git 仓库、CLI 运行辅助函数。
- `tests/unit/*.test.ts`：解析、分类、脱敏、状态等单元测试。
- `tests/integration/*.test.ts`：CLI、索引、查询、handoff、MCP 集成测试。
- `README.md`：用户上手文档和 MVP 限制。

## Task 1: 项目脚手架与本地任务描述

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/cli/main.ts`
- Create: `src/types/domain.ts`
- Create: `docs/process/local-issues/0001-contextgraph-mvp.md`

- [ ] **Step 1: 创建本地 Issue 镜像**

Create `docs/process/local-issues/0001-contextgraph-mvp.md`:

```markdown
# 0001 ContextGraph MVP

## Background

ContextGraph 需要为编程 Agent 提供本地、可查询、可信的新鲜上下文图谱，避免每次任务都从 grep/read 重新发现项目经验。

## User story

作为编程 Agent 或开发者，我希望通过本地 CLI 和 MCP 查询项目规约、命令、测试、失败、修复和会话交接信息，从而基于统一上下文工作。

## Scope

- 实现 `init -> index -> status -> query -> handoff -> mcp`。
- 使用 TypeScript、Node.js 22 LTS、SQLite 和 FTS5。
- 仅支持仓库内 npm scripts 运行。
- 支持 Markdown、JSON、普通文本索引。
- 实现 hash 增量索引、状态可信度、secret 脱敏、基础 MCP tools。
- 提供 README 和自动化测试。

## Out of scope

- Watch 模式。
- 远程 LLM、云同步、向量数据库、UI、编辑器扩展。
- 全局 npm 安装、`npm link`、Docker 运行。
- 存量历史 session 导入不在 MVP 内实现，但 Phase 2 必须实现，不能从路线中移除。
- 项目工具环境画像不在 MVP 内实现，但 Phase 2 必须与历史 session 导入一起设计。

## Acceptance criteria

- [ ] 空项目可执行 `contextgraph init`。
- [ ] 索引 `AGENTS.md` 后生成并填充 `.contextgraph/graph.db`。
- [ ] `status` 显示 Fresh/Stale、Reliability、Last indexed、Current HEAD、Indexed HEAD。
- [ ] 修改配置内源文件但不重新索引时状态变为 Stale。
- [ ] 重新索引后状态恢复 Fresh。
- [ ] `query "测试"` 返回 Test、Rule 或 Command 节点及来源证据。
- [ ] `handoff` 写入 session 和相关节点。
- [ ] `mcp` 通过 stdio 暴露 `get_context_status` 和 `get_relevant_context`。
- [ ] Secret 不以明文持久化。
- [ ] `npm test`、类型检查、构建全部通过。
- [ ] README 可指导新用户在不全局安装的情况下跑通流程。

## Technical notes

- 规格来源：`docs/superpowers/specs/2026-06-15-contextgraph-mvp-design.md`。
- 当前仓库无 GitHub remote，发布前需要创建同内容 GitHub Issue。
- 仓库 Git 身份必须为 `StarDreamG <StarDreamG@users.noreply.github.com>`。

## Risks

- better-sqlite3 原生依赖与 Node 版本兼容。
- status 若只比较 Git HEAD 会漏掉未提交文件变化。
- MCP stdout 被日志污染会破坏协议。
- FTS 查询语法需要清洗。
- 如果没有 Phase 2 的存量 session 导入，已有项目只能从新 handoff 开始积累，上手价值会不足。
- 如果没有项目工具环境画像，新 Agent 仍不知道该项目应优先加载哪些 MCP server、skills 和自动化工具。
```

- [ ] **Step 2: 创建 package.json**

Create `package.json`:

```json
{
  "name": "contextgraph",
  "version": "0.1.0",
  "description": "Local-first context graph for coding agents.",
  "type": "module",
  "private": true,
  "engines": {
    "node": ">=22 <25"
  },
  "bin": {
    "contextgraph": "./dist/cli/main.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "contextgraph": "node dist/cli/main.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.13.0",
    "better-sqlite3": "^11.10.0",
    "commander": "^12.1.0",
    "fast-glob": "^3.3.3",
    "gray-matter": "^4.0.3",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.15.34",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 3: 创建 TypeScript 与测试配置**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000
  }
});
```

- [ ] **Step 4: 创建领域类型骨架**

Create `src/types/domain.ts`:

```ts
export type NodeType =
  | "Rule"
  | "Workflow"
  | "Command"
  | "Test"
  | "Decision"
  | "Failure"
  | "Fix"
  | "Environment"
  | "Preference"
  | "Note"
  | "AgentSession"
  | "File";

export type GraphStatus = "Fresh" | "Stale";
export type Reliability = "High" | "Medium" | "Low";

export interface PrivacyConfig {
  offline: true;
  allowRemoteLLM: false;
  redactSecrets: true;
}

export interface ContextGraphConfig {
  version: 1;
  projectName: string;
  sources: string[];
  ignore: string[];
  privacy: PrivacyConfig;
}

export interface SourceRecord {
  id: string;
  path: string;
  type: string;
  hash: string;
  gitHead: string | null;
  lastIndexedAt: string;
  metadata: Record<string, unknown>;
}

export interface BlockRecord {
  id: string;
  sourceId: string;
  path: string;
  blockType: string;
  title: string | null;
  content: string;
  hash: string;
  startLine: number | null;
  endLine: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeRecord {
  id: string;
  type: NodeType;
  title: string;
  content: string;
  sourceId: string | null;
  blockId: string | null;
  confidence: number;
  status: "confirmed" | "warning";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QueryResult {
  type: NodeType;
  title: string;
  content: string;
  sourcePath: string | null;
  startLine: number | null;
  endLine: number | null;
  confidence: number;
  status: string;
  rank: number;
}

export interface StatusSnapshot {
  status: GraphStatus;
  reliability: Reliability;
  lastIndexedAt: string | null;
  currentGitHead: string | null;
  indexedGitHead: string | null;
  sourceCount: number;
  blockCount: number;
  nodeCount: number;
  edgeCount: number;
  changedFiles: number;
  pendingBlocks: number;
  failedBlocks: number;
  conflicts: number;
  warnings: string[];
}
```

- [ ] **Step 5: 创建 CLI 入口占位并验证编译失败**

Create `src/cli/main.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";

export function buildProgram(): Command {
  const program = new Command();
  program.name("contextgraph").description("Local-first context graph for coding agents.");
  program.command("init").description("Initialize ContextGraph").action(() => {
    console.log("init is not implemented yet");
  });
  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
```

Run:

```bash
npm install
npm run check
```

Expected: `npm install` creates `package-lock.json` and `npm run check` passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/cli/main.ts src/types/domain.ts docs/process/local-issues/0001-contextgraph-mvp.md
git commit -m "chore: scaffold ContextGraph TypeScript project"
```

## Task 2: 默认配置、路径安全和脱敏

**Files:**
- Create: `src/config/defaults.ts`
- Create: `src/config/loadConfig.ts`
- Create: `src/security/redaction.ts`
- Test: `tests/unit/redaction.test.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: 写脱敏测试**

Create `tests/unit/redaction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSensitivePath, redactSecrets } from "../../src/security/redaction.js";

describe("redaction", () => {
  it("detects sensitive paths before reading", () => {
    expect(isSensitivePath(".env")).toBe(true);
    expect(isSensitivePath("config/private.key")).toBe(true);
    expect(isSensitivePath("certs/server.pem")).toBe(true);
    expect(isSensitivePath("docs/rules.md")).toBe(false);
  });

  it("redacts secret assignments and private key blocks", () => {
    const apiKeyLine = ["API_KEY", "abc123"].join("=");
    const passwordLine = ["password", "open-sesame"].join(" = ");
    const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const privateKeyFooter = ["-----END", "PRIVATE KEY-----"].join(" ");
    const input = [
      apiKeyLine,
      passwordLine,
      privateKeyHeader,
      "secret material",
      privateKeyFooter
    ].join("\n");
    const output = redactSecrets(input);
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("open-sesame");
    expect(output).not.toContain("secret material");
    expect(output.match(/\[REDACTED_SECRET\]/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: 实现脱敏**

Create `src/security/redaction.ts`:

```ts
const sensitivePathPatterns = [
  /(^|\/)\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)id_rsa$/i,
  /(^|\/)id_ed25519$/i
];

const privateKeyPattern =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const assignmentPattern =
  /\b(API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE)\b\s*=\s*([^\n\r]+)/gi;

export function isSensitivePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return sensitivePathPatterns.some((pattern) => pattern.test(normalized));
}

export function redactSecrets(content: string): string {
  return content
    .replace(privateKeyPattern, "[REDACTED_SECRET]")
    .replace(assignmentPattern, "$1=[REDACTED_SECRET]");
}
```

- [ ] **Step 3: 写配置测试**

Create `tests/unit/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, CONTEXTGRAPH_AGENT_SECTION } from "../../src/config/defaults.js";

describe("default config", () => {
  it("is offline and redacts secrets", () => {
    expect(DEFAULT_CONFIG.privacy).toEqual({
      offline: true,
      allowRemoteLLM: false,
      redactSecrets: true
    });
    expect(DEFAULT_CONFIG.sources).toContain("AGENTS.md");
    expect(DEFAULT_CONFIG.ignore).toContain(".env");
    expect(DEFAULT_CONFIG.ignore).toContain(".contextgraph/graph.db");
  });

  it("contains agent instructions for status, index, query, and handoff", () => {
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph status");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph index");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph query");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph handoff");
  });
});
```

- [ ] **Step 4: 实现默认配置和配置读取**

Create `src/config/defaults.ts`:

```ts
import type { ContextGraphConfig } from "../types/domain.js";

export const DEFAULT_CONFIG: ContextGraphConfig = {
  version: 1,
  projectName: "",
  sources: [
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "docs/**/*.md",
    ".cursor/rules/**/*",
    "bruno/**/*",
    "tests/**/*",
    "playwright.config.*",
    "package.json",
    "pom.xml"
  ],
  ignore: [
    ".env",
    "*.pem",
    "*.key",
    "id_rsa",
    "node_modules/**",
    "target/**",
    "dist/**",
    "build/**",
    ".git/**",
    ".contextgraph/graph.db"
  ],
  privacy: {
    offline: true,
    allowRemoteLLM: false,
    redactSecrets: true
  }
};

export const CONTEXTGRAPH_AGENT_SECTION_START = "<!-- contextgraph:start -->";
export const CONTEXTGRAPH_AGENT_SECTION_END = "<!-- contextgraph:end -->";

export const CONTEXTGRAPH_AGENT_SECTION = `${CONTEXTGRAPH_AGENT_SECTION_START}

# Agent Instructions

This project uses ContextGraph.
Before starting any task:
1. Run \`contextgraph status\`.
2. If status is stale, run \`contextgraph index\`.
3. Query relevant project context with \`contextgraph query "<task>"\`.
4. After finishing, record a handoff summary with \`contextgraph handoff\`.

Do not rely only on this file. The source of truth for project context is \`.contextgraph/graph.db\`.

${CONTEXTGRAPH_AGENT_SECTION_END}`;
```

Create `src/config/loadConfig.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ContextGraphConfig } from "../types/domain.js";

const configSchema = z.object({
  version: z.literal(1),
  projectName: z.string(),
  sources: z.array(z.string()).min(1),
  ignore: z.array(z.string()),
  privacy: z.object({
    offline: z.literal(true),
    allowRemoteLLM: z.literal(false),
    redactSecrets: z.literal(true)
  })
});

export async function loadConfig(projectRoot: string): Promise<ContextGraphConfig> {
  const configPath = path.join(projectRoot, ".contextgraph", "config.json");
  const raw = await readFile(configPath, "utf8");
  return configSchema.parse(JSON.parse(raw));
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/redaction.test.ts tests/unit/config.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/config src/security tests/unit/redaction.test.ts tests/unit/config.test.ts
git commit -m "feat: add default config and secret redaction"
```

## Task 3: SQLite schema and repository layer

**Files:**
- Create: `src/storage/database.ts`
- Create: `src/storage/schema.ts`
- Create: `src/storage/repositories.ts`
- Test: `tests/unit/storage.test.ts`

- [ ] **Step 1: 写 schema 测试**

Create `tests/unit/storage.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/storage/database.js";
import { migrate } from "../../src/storage/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "contextgraph-storage-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("storage schema", () => {
  it("creates required tables and FTS index", () => {
    const db = openDatabase(path.join(tempDir, "graph.db"));
    migrate(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toContain("sources");
    expect(tables).toContain("blocks");
    expect(tables).toContain("nodes");
    expect(tables).toContain("edges");
    expect(tables).toContain("sessions");
    expect(tables).toContain("status");
    expect(tables).toContain("nodes_fts");
    db.close();
  });
});
```

- [ ] **Step 2: 实现数据库打开和迁移**

Create `src/storage/database.ts`:

```ts
import Database from "better-sqlite3";

export type ContextGraphDatabase = Database.Database;

export function openDatabase(dbPath: string): ContextGraphDatabase {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}
```

Create `src/storage/schema.ts`:

```ts
import type { ContextGraphDatabase } from "./database.js";

export function migrate(db: ContextGraphDatabase): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  hash TEXT NOT NULL,
  git_head TEXT,
  last_indexed_at TEXT NOT NULL,
  metadata TEXT
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  path TEXT NOT NULL,
  block_type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_id TEXT,
  block_id TEXT,
  confidence REAL DEFAULT 1.0,
  status TEXT DEFAULT 'confirmed',
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE,
  FOREIGN KEY(block_id) REFERENCES blocks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(from_node) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY(to_node) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent TEXT,
  task TEXT,
  summary TEXT,
  git_head TEXT,
  started_at TEXT,
  ended_at TEXT,
  metadata TEXT
);
CREATE TABLE IF NOT EXISTS status (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  node_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'
);
CREATE INDEX IF NOT EXISTS idx_sources_path ON sources(path);
CREATE INDEX IF NOT EXISTS idx_blocks_source ON blocks(source_id);
CREATE INDEX IF NOT EXISTS idx_nodes_source ON nodes(source_id);
CREATE INDEX IF NOT EXISTS idx_nodes_block ON nodes(block_id);
`);
}
```

- [ ] **Step 3: 实现 repository 基础写入**

Create `src/storage/repositories.ts`:

```ts
import type { BlockRecord, NodeRecord, SourceRecord, StatusSnapshot } from "../types/domain.js";
import type { ContextGraphDatabase } from "./database.js";

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export class GraphRepository {
  constructor(private readonly db: ContextGraphDatabase) {}

  upsertSource(source: SourceRecord): void {
    this.db
      .prepare(
        `INSERT INTO sources (id, path, type, hash, git_head, last_indexed_at, metadata)
         VALUES (@id, @path, @type, @hash, @gitHead, @lastIndexedAt, @metadata)
         ON CONFLICT(id) DO UPDATE SET
           path = excluded.path,
           type = excluded.type,
           hash = excluded.hash,
           git_head = excluded.git_head,
           last_indexed_at = excluded.last_indexed_at,
           metadata = excluded.metadata`
      )
      .run({ ...source, metadata: json(source.metadata) });
  }

  replaceBlocksAndNodes(sourceId: string, blocks: BlockRecord[], nodes: NodeRecord[]): void {
    this.db.prepare("DELETE FROM blocks WHERE source_id = ?").run(sourceId);
    const insertBlock = this.db.prepare(
      `INSERT INTO blocks (id, source_id, path, block_type, title, content, hash, start_line, end_line, created_at, updated_at)
       VALUES (@id, @sourceId, @path, @blockType, @title, @content, @hash, @startLine, @endLine, @createdAt, @updatedAt)`
    );
    const insertNode = this.db.prepare(
      `INSERT INTO nodes (id, type, title, content, source_id, block_id, confidence, status, metadata, created_at, updated_at)
       VALUES (@id, @type, @title, @content, @sourceId, @blockId, @confidence, @status, @metadata, @createdAt, @updatedAt)`
    );
    const insertFts = this.db.prepare("INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)");
    for (const block of blocks) {
      insertBlock.run(block);
    }
    for (const node of nodes) {
      insertNode.run({ ...node, metadata: json(node.metadata) });
      insertFts.run(node.id, node.title, node.content);
    }
  }

  setStatus(snapshot: StatusSnapshot): void {
    const stmt = this.db.prepare(
      `INSERT INTO status (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    for (const [key, value] of Object.entries(snapshot)) {
      stmt.run(key, JSON.stringify(value));
    }
  }

  counts(): { sources: number; blocks: number; nodes: number; edges: number } {
    const count = (table: string): number => {
      const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      return Number(row.count);
    };
    return {
      sources: count("sources"),
      blocks: count("blocks"),
      nodes: count("nodes"),
      edges: count("edges")
    };
  }
}
```

- [ ] **Step 4: Run storage tests**

```bash
npm test -- tests/unit/storage.test.ts
npm run check
```

Expected: storage tests and type check pass.

- [ ] **Step 5: Commit**

```bash
git add src/storage tests/unit/storage.test.ts
git commit -m "feat: add SQLite schema and repository layer"
```

## Task 4: init command

**Files:**
- Create: `src/core/initService.ts`
- Create: `src/commands/initCommand.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/integration/init.test.ts`

- [ ] **Step 1: 写 init 集成测试**

Create `tests/integration/init.test.ts`:

```ts
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject } from "../helpers/project.js";
import { initContextGraph } from "../../src/core/initService.js";

describe("init", () => {
  it("creates ContextGraph files and idempotent AGENTS instructions", async () => {
    const project = await createTempProject();
    try {
      await initContextGraph(project.root);
      await initContextGraph(project.root);
      await stat(path.join(project.root, ".contextgraph", "graph.db"));
      await stat(path.join(project.root, ".contextgraph", "config.json"));
      await stat(path.join(project.root, ".contextgraph", "status.json"));
      await stat(path.join(project.root, ".contextgraph", "sessions"));
      const agents = await readFile(path.join(project.root, "AGENTS.md"), "utf8");
      expect(agents.match(/contextgraph:start/g)?.length).toBe(1);
      expect(agents).toContain("contextgraph status");
    } finally {
      await project.cleanup();
    }
  });
});
```

- [ ] **Step 2: 创建测试辅助函数**

Create `tests/helpers/project.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TempProject {
  root: string;
  cleanup: () => Promise<void>;
}

export async function createTempProject(): Promise<TempProject> {
  const root = await mkdtemp(path.join(os.tmpdir(), "contextgraph-project-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
```

- [ ] **Step 3: 实现 init 服务**

Create `src/core/initService.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG, CONTEXTGRAPH_AGENT_SECTION, CONTEXTGRAPH_AGENT_SECTION_START } from "../config/defaults.js";
import { openDatabase } from "../storage/database.js";
import { migrate } from "../storage/schema.js";

export interface InitResult {
  projectRoot: string;
  createdGraphDir: string;
}

export async function initContextGraph(projectRoot: string): Promise<InitResult> {
  const graphDir = path.join(projectRoot, ".contextgraph");
  await mkdir(path.join(graphDir, "sessions"), { recursive: true });
  await mkdir(path.join(graphDir, "logs"), { recursive: true });
  await mkdir(path.join(graphDir, "snapshots"), { recursive: true });
  await writeFile(path.join(graphDir, "config.json"), JSON.stringify(DEFAULT_CONFIG, null, 2), { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  await writeFile(
    path.join(graphDir, "status.json"),
    JSON.stringify({ status: "Stale", reliability: "Low", lastIndexedAt: null }, null, 2),
    { flag: "wx" }
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const db = openDatabase(path.join(graphDir, "graph.db"));
  migrate(db);
  db.close();
  await ensureAgentsSection(path.join(projectRoot, "AGENTS.md"));
  return { projectRoot, createdGraphDir: graphDir };
}

async function ensureAgentsSection(agentsPath: string): Promise<void> {
  const existing = await readFile(agentsPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (existing.includes(CONTEXTGRAPH_AGENT_SECTION_START)) return;
  const next = existing.trim().length === 0 ? `${CONTEXTGRAPH_AGENT_SECTION}\n` : `${existing.trimEnd()}\n\n${CONTEXTGRAPH_AGENT_SECTION}\n`;
  await writeFile(agentsPath, next);
}
```

- [ ] **Step 4: 连接 CLI 命令**

Create `src/commands/initCommand.ts`:

```ts
import type { Command } from "commander";
import { initContextGraph } from "../core/initService.js";

export function registerInitCommand(program: Command): void {
  program.command("init").description("Initialize ContextGraph in the current project").action(async () => {
    const result = await initContextGraph(process.cwd());
    console.log("ContextGraph initialized.");
    console.log(`Project: ${result.projectRoot}`);
    console.log(`Graph: ${result.createdGraphDir}`);
  });
}
```

Modify `src/cli/main.ts` so `buildProgram` becomes:

```ts
import { Command } from "commander";
import { registerInitCommand } from "../commands/initCommand.js";

export function buildProgram(): Command {
  const program = new Command();
  program.name("contextgraph").description("Local-first context graph for coding agents.");
  registerInitCommand(program);
  return program;
}
```

- [ ] **Step 5: Run init tests**

```bash
npm test -- tests/integration/init.test.ts
npm run check
npm run build
```

Expected: tests, type check, and build pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/initService.ts src/commands/initCommand.ts src/cli/main.ts tests/helpers/project.ts tests/integration/init.test.ts
git commit -m "feat: implement contextgraph init"
```

## Task 5: parsers and classifier

**Files:**
- Create: `src/parsing/markdown.ts`
- Create: `src/parsing/json.ts`
- Create: `src/parsing/text.ts`
- Create: `src/indexing/classifier.ts`
- Test: `tests/unit/parsing.test.ts`
- Test: `tests/unit/classifier.test.ts`

- [ ] **Step 1: 写 parsing 测试**

Create `tests/unit/parsing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "../../src/parsing/markdown.js";
import { parseJsonBlocks } from "../../src/parsing/json.js";
import { parseTextBlocks } from "../../src/parsing/text.js";

describe("parsers", () => {
  it("splits markdown by headings and keeps line ranges", () => {
    const blocks = parseMarkdownBlocks("docs/rules.md", "# Root\nintro\n\n## 后端规范\n必须运行 npm test\n\n## 测试\nnpx playwright test\n");
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toMatchObject({
      blockType: "markdown_section",
      title: "后端规范",
      startLine: 4,
      endLine: 5
    });
  });

  it("splits json by top-level keys", () => {
    const blocks = parseJsonBlocks("package.json", "{\"scripts\":{\"test\":\"vitest\"},\"name\":\"demo\"}");
    expect(blocks.map((block) => block.title)).toEqual(["scripts", "name"]);
  });

  it("splits plain text by paragraphs", () => {
    const blocks = parseTextBlocks("notes.txt", "first paragraph\n\nsecond paragraph");
    expect(blocks).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 写 classifier 测试**

Create `tests/unit/classifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyBlock } from "../../src/indexing/classifier.js";

describe("classifier", () => {
  it("extracts command, test, rule, failure, and fix nodes", () => {
    expect(classifyBlock({ title: "命令", content: "npm test", sourceId: "s", blockId: "b" }).map((node) => node.type)).toContain("Command");
    expect(classifyBlock({ title: "测试", content: "Playwright export.spec.ts", sourceId: "s", blockId: "b" }).map((node) => node.type)).toContain("Test");
    expect(classifyBlock({ title: "规范", content: "必须保持字段顺序", sourceId: "s", blockId: "b" }).map((node) => node.type)).toContain("Rule");
    expect(classifyBlock({ title: "失败", content: "failed because timeout", sourceId: "s", blockId: "b" }).map((node) => node.type)).toContain("Failure");
    expect(classifyBlock({ title: "修复", content: "fix resolved retry issue", sourceId: "s", blockId: "b" }).map((node) => node.type)).toContain("Fix");
  });
});
```

- [ ] **Step 3: 实现 parser 和 classifier**

Implement:

- `parseMarkdownBlocks(path, content)` returns `{ blockType, title, content, startLine, endLine }[]` by heading sections, ignoring frontmatter delimiters.
- `parseJsonBlocks(path, content)` parses JSON and returns one block per top-level key with formatted JSON content.
- `parseTextBlocks(path, content)` returns non-empty paragraph blocks.
- `classifyBlock(input)` returns one or more Node draft objects with deterministic precedence: `Command`, `Test`, `Rule`, `Failure`, `Fix`, `Decision`, `Environment`, `Preference`, fallback `Note`.

Use this classifier signature:

```ts
export interface ClassifyInput {
  title: string | null;
  content: string;
  sourceId: string;
  blockId: string;
}

export interface NodeDraft {
  type: NodeType;
  title: string;
  content: string;
  confidence: number;
  status: "confirmed";
  metadata: Record<string, unknown>;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/parsing.test.ts tests/unit/classifier.test.ts
npm run check
```

Expected: parser and classifier tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parsing src/indexing/classifier.ts tests/unit/parsing.test.ts tests/unit/classifier.test.ts
git commit -m "feat: parse sources into classified context nodes"
```

## Task 6: scanner, hashing, and index command

**Files:**
- Create: `src/indexing/scanner.ts`
- Create: `src/indexing/hash.ts`
- Create: `src/core/indexService.ts`
- Create: `src/commands/indexCommand.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/integration/index.test.ts`

- [ ] **Step 1: 写 index 集成测试**

Create `tests/integration/index.test.ts`:

```ts
import Database from "better-sqlite3";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initContextGraph } from "../../src/core/initService.js";
import { indexContextGraph } from "../../src/core/indexService.js";
import { createTempProject } from "../helpers/project.js";

describe("index", () => {
  it("indexes AGENTS markdown into sources, blocks, nodes, and FTS", async () => {
    const project = await createTempProject();
    try {
      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试规范\n修改导出必须运行 npm test\n");
      await initContextGraph(project.root);
      const result = await indexContextGraph(project.root);
      expect(result.sourcesScanned).toBeGreaterThanOrEqual(1);
      expect(result.nodesCreated).toBeGreaterThanOrEqual(1);
      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const nodes = db.prepare("SELECT type, content FROM nodes").all() as Array<{ type: string; content: string }>;
      expect(nodes.some((node) => node.type === "Command" || node.type === "Test" || node.type === "Rule")).toBe(true);
      db.close();
    } finally {
      await project.cleanup();
    }
  });
});
```

- [ ] **Step 2: 实现 scanner 与 hash**

Implement `src/indexing/hash.ts`:

```ts
import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function stableId(...parts: string[]): string {
  return sha256(parts.join("\u001f")).slice(0, 32);
}
```

Implement `src/indexing/scanner.ts` with `fast-glob`:

```ts
import fg from "fast-glob";
import path from "node:path";
import { isSensitivePath } from "../security/redaction.js";
import type { ContextGraphConfig } from "../types/domain.js";

export async function scanSources(projectRoot: string, config: ContextGraphConfig): Promise<string[]> {
  const entries = await fg(config.sources, {
    cwd: projectRoot,
    dot: true,
    onlyFiles: true,
    ignore: config.ignore
  });
  return entries
    .map((entry) => entry.split(path.sep).join("/"))
    .filter((entry) => !isSensitivePath(entry))
    .sort();
}
```

- [ ] **Step 3: 实现 index 服务**

Implement `src/core/indexService.ts`:

- Load config.
- Scan files.
- Read and redact content.
- Compute source hash after redaction.
- Skip source if stored hash matches.
- Parse by extension: `.md` as Markdown, `.json` as JSON, otherwise text.
- Build Source, Block, Node records with deterministic IDs.
- Replace blocks and nodes for changed source in a single transaction.
- Remove missing source records.
- Persist status JSON and SQLite status keys.

Use this result interface:

```ts
export interface IndexResult {
  sourcesScanned: number;
  sourcesChanged: number;
  blocksIndexed: number;
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  currentHead: string | null;
  indexedHead: string | null;
  lastIndexedAt: string;
  status: "Fresh" | "Stale";
}
```

- [ ] **Step 4: 连接 CLI**

Create `src/commands/indexCommand.ts` and register it in `src/cli/main.ts`.

CLI output must include:

```text
ContextGraph index complete.
Sources scanned: <n>
Sources changed: <n>
Blocks indexed: <n>
Nodes created: <n>
Nodes updated: <n>
Edges created: <n>
Current HEAD: <head>
Indexed HEAD: <head>
Last indexed: <iso time>
Status: Fresh
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/integration/index.test.ts
npm run check
```

Expected: index test and type check pass.

- [ ] **Step 6: Commit**

```bash
git add src/indexing src/core/indexService.ts src/commands/indexCommand.ts src/cli/main.ts tests/integration/index.test.ts
git commit -m "feat: implement incremental indexing"
```

## Task 7: status command and trust layer

**Files:**
- Create: `src/git/gitState.ts`
- Create: `src/core/statusService.ts`
- Create: `src/commands/statusCommand.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/integration/status.test.ts`

- [ ] **Step 1: 写 status 测试**

Create `tests/integration/status.test.ts`:

```ts
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { initContextGraph } from "../../src/core/initService.js";
import { indexContextGraph } from "../../src/core/indexService.js";
import { getContextStatus } from "../../src/core/statusService.js";
import { createTempProject } from "../helpers/project.js";

const execFileAsync = promisify(execFile);

describe("status", () => {
  it("detects fresh state and unindexed source edits", async () => {
    const project = await createTempProject();
    try {
      const agentsPath = path.join(project.root, "AGENTS.md");
      await writeFile(agentsPath, "## 测试\n必须运行 npm test\n");
      await execFileAsync("git", ["add", "AGENTS.md"], { cwd: project.root });
      await execFileAsync("git", ["commit", "-m", "docs: add agents"], { cwd: project.root });
      await initContextGraph(project.root);
      await indexContextGraph(project.root);
      expect((await getContextStatus(project.root)).status).toBe("Fresh");
      await writeFile(agentsPath, "## 测试\n必须运行 npm test\n\n新增规则\n");
      const stale = await getContextStatus(project.root);
      expect(stale.status).toBe("Stale");
      expect(stale.reliability).toBe("Low");
      expect(stale.changedFiles).toBeGreaterThan(0);
    } finally {
      await project.cleanup();
    }
  });
});
```

- [ ] **Step 2: 实现 Git 状态适配器**

Implement `src/git/gitState.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function currentGitHead(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: projectRoot });
    return stdout.trim();
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: 实现 status 服务**

Implement `src/core/statusService.ts`:

- If `.contextgraph/graph.db` missing, return `Stale` and `Low`.
- Load config and scan current sources.
- Compare current source hashes after redaction with stored source hashes.
- Compare current HEAD with indexed HEAD from status table.
- Count sources, blocks, nodes, edges, failed blocks.
- Return `Fresh` with High or Medium only when source set and hashes match.

- [ ] **Step 4: 连接 CLI**

Create `src/commands/statusCommand.ts` and register in `src/cli/main.ts`.

Output layout:

```text
ContextGraph Status
────────────────────────────────
Project:        <project-name>
Status:         Fresh
Reliability:    High
Last indexed:   <time>
Current HEAD:   <head>
Indexed HEAD:   <head>
Sources:        <n>
Blocks:         <n>
Nodes:          <n>
Edges:          <n>
Changed files:  <n>
Pending blocks: <n>
Failed blocks:  <n>
Conflicts:      <n>
MCP server:     stopped
Watcher:        stopped
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/integration/status.test.ts
npm run check
```

Expected: status test and type check pass.

- [ ] **Step 6: Commit**

```bash
git add src/git src/core/statusService.ts src/commands/statusCommand.ts src/cli/main.ts tests/integration/status.test.ts
git commit -m "feat: add status trust layer"
```

## Task 8: query command

**Files:**
- Create: `src/core/queryService.ts`
- Create: `src/commands/queryCommand.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/integration/query.test.ts`

- [ ] **Step 1: 写 query 测试**

Create `tests/integration/query.test.ts`:

```ts
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initContextGraph } from "../../src/core/initService.js";
import { indexContextGraph } from "../../src/core/indexService.js";
import { queryContext } from "../../src/core/queryService.js";
import { createTempProject } from "../helpers/project.js";

describe("query", () => {
  it("returns relevant FTS context with source evidence", async () => {
    const project = await createTempProject();
    try {
      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试规范\n修改导出必须运行 npm test\n");
      await initContextGraph(project.root);
      await indexContextGraph(project.root);
      const result = await queryContext(project.root, "测试");
      expect(result.status.status).toBe("Fresh");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].sourcePath).toBe("AGENTS.md");
    } finally {
      await project.cleanup();
    }
  });
});
```

- [ ] **Step 2: 实现 query 服务**

Implement `src/core/queryService.ts`:

- Get status using `getContextStatus`.
- Normalize query by splitting on whitespace and escaping `"` characters.
- Use FTS query first; if FTS syntax fails, retry with quoted terms.
- Join `nodes` to `blocks` for source path and line range.
- Return top 10 results with stale warning when status is `Stale`.

- [ ] **Step 3: 连接 CLI**

Create `src/commands/queryCommand.ts` and register in `src/cli/main.ts`.

Output must include:

```text
ContextGraph Query
────────────────────────────────
Query: <query>
Status: <Fresh|Stale>
Reliability: <High|Medium|Low>
Relevant Context:
[Rule] <title>
Source: AGENTS.md:1-3
Confidence: 1
Status: confirmed
Content:
<excerpt>
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/integration/query.test.ts
npm run check
```

Expected: query test and type check pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/queryService.ts src/commands/queryCommand.ts src/cli/main.ts tests/integration/query.test.ts
git commit -m "feat: add context query command"
```

## Task 9: handoff command

**Files:**
- Create: `src/core/handoffService.ts`
- Create: `src/commands/handoffCommand.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/integration/handoff.test.ts`

- [ ] **Step 1: 写 handoff 测试**

Create `tests/integration/handoff.test.ts`:

```ts
import Database from "better-sqlite3";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initContextGraph } from "../../src/core/initService.js";
import { recordHandoff } from "../../src/core/handoffService.js";
import { createTempProject } from "../helpers/project.js";

describe("handoff", () => {
  it("creates a session and semantic nodes from summary", async () => {
    const project = await createTempProject();
    try {
      await initContextGraph(project.root);
      const result = await recordHandoff(project.root, {
        agent: "codex",
        task: "实现导出",
        summary: "已 fix failed test，需要运行 npm test",
        files: ["src/export.ts"]
      });
      expect(result.nodesCreated).toBeGreaterThanOrEqual(2);
      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const sessions = db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
      expect(sessions.count).toBe(1);
      db.close();
    } finally {
      await project.cleanup();
    }
  });
});
```

- [ ] **Step 2: 实现 handoff 服务**

Implement `src/core/handoffService.ts`:

- Build session id as `<yyyy-mm-dd-hhmmss>-<agent>`.
- Insert `sessions`.
- Insert one `AgentSession` node.
- Classify summary text and insert `Failure`、`Fix`、`Test` or `Note` nodes.
- Insert `File` nodes for provided files.
- Insert edges: `PRODUCED` and `RELATED_TO_FILE`.
- Sync FTS for inserted nodes.

- [ ] **Step 3: 连接 CLI**

Create `src/commands/handoffCommand.ts` with required options `--agent`, `--task`, `--summary` and optional `--files`.

Output:

```text
Handoff recorded.
Session: <id>
Agent: <agent>
Task: <task>
Git HEAD: <head>
Nodes created: <n>
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/integration/handoff.test.ts
npm run check
```

Expected: handoff test and type check pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/handoffService.ts src/commands/handoffCommand.ts src/cli/main.ts tests/integration/handoff.test.ts
git commit -m "feat: record agent handoff sessions"
```

## Task 10: MCP stdio server

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/commands/mcpCommand.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/integration/mcp.test.ts`

- [ ] **Step 1: 写 MCP 集成测试**

Create `tests/integration/mcp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../../src/mcp/server.js";

describe("mcp server", () => {
  it("creates a server exposing required tools", () => {
    const server = createMcpServer({ projectRoot: process.cwd() });
    expect(server).toBeDefined();
  });
});
```

- [ ] **Step 2: 实现 MCP server**

Implement `src/mcp/server.ts`:

- Use `@modelcontextprotocol/sdk/server/mcp.js`.
- Register `get_context_status` with no required input.
- Register `get_relevant_context` with `{ task: string, files?: string[] }`.
- Return JSON text content from tools.
- Use stderr for diagnostic messages.

- [ ] **Step 3: 连接 CLI**

Create `src/commands/mcpCommand.ts`:

- On `contextgraph mcp`, create stdio transport.
- Connect server.
- Do not print banners to stdout.
- Print startup errors to stderr.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/integration/mcp.test.ts
npm run check
```

Expected: MCP test and type check pass.

- [ ] **Step 5: Commit**

```bash
git add src/mcp src/commands/mcpCommand.ts src/cli/main.ts tests/integration/mcp.test.ts
git commit -m "feat: expose ContextGraph through MCP"
```

## Task 11: README and end-to-end acceptance

**Files:**
- Create: `README.md`
- Test: `tests/integration/e2e.test.ts`

- [ ] **Step 1: 写 E2E 测试**

Create `tests/integration/e2e.test.ts`:

```ts
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTempProject } from "../helpers/project.js";

const execFileAsync = promisify(execFile);

describe("CLI e2e", () => {
  it("runs init, index, status, query, and handoff from the built CLI", async () => {
    const project = await createTempProject();
    try {
      const cli = path.resolve("dist/cli/main.js");
      await execFileAsync("node", [cli, "init"], { cwd: project.root });
      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试\n必须运行 npm test\n");
      const index = await execFileAsync("node", [cli, "index"], { cwd: project.root });
      expect(index.stdout).toContain("ContextGraph index complete.");
      const status = await execFileAsync("node", [cli, "status"], { cwd: project.root });
      expect(status.stdout).toContain("Status:");
      const query = await execFileAsync("node", [cli, "query", "测试"], { cwd: project.root });
      expect(query.stdout).toContain("Relevant Context:");
      const handoff = await execFileAsync("node", [
        cli,
        "handoff",
        "--agent",
        "codex",
        "--task",
        "测试",
        "--summary",
        "fix failed test",
        "--files",
        "AGENTS.md"
      ], { cwd: project.root });
      expect(handoff.stdout).toContain("Handoff recorded.");
    } finally {
      await project.cleanup();
    }
  });
});
```

- [ ] **Step 2: 创建 README**

Create `README.md` with:

```markdown
# ContextGraph

ContextGraph is a local-first context graph for coding agents.
Markdown files are sources.
Agent sessions are sources.
Git history is a source.
Test commands are sources.
The graph is the interface.
The status is the trust layer.
MCP is the agent protocol.

## What It Is

ContextGraph indexes project rules, workflows, commands, tests, decisions, failures, fixes, environment notes, preferences, and agent handoffs into a local SQLite graph.

It is built for coding agents that need reliable project context before editing code.

## What It Is Not

ContextGraph is not a Markdown document manager, cloud knowledge base, vector database, remote LLM wrapper, or UI-first documentation tool.

## Local Workflow

Install dependencies inside this repository:

```bash
npm install
npm run build
```

Run commands from the repository:

```bash
npm run contextgraph -- init
npm run contextgraph -- index
npm run contextgraph -- status
npm run contextgraph -- query "测试"
npm run contextgraph -- handoff --agent codex --task "实现功能" --summary "完成实现，已运行 npm test" --files "src/example.ts"
```

## Commands

- `init`: creates `.contextgraph`, `graph.db`, config, status, and AGENTS.md instructions.
- `index`: scans configured sources, redacts secrets, creates blocks, nodes, FTS rows, and status.
- `status`: reports freshness and reliability.
- `query`: searches relevant graph context.
- `handoff`: records an agent session summary.
- `mcp`: starts a stdio MCP server for local agents.

## Security

ContextGraph is local-first. The MVP does not upload data, call remote LLMs, open network ports, or sync to cloud services.

Sensitive paths such as `.env`, private keys, certificates, dependencies, build output, Git internals, and `.contextgraph/graph.db` are ignored by default. Secret-like content is redacted before persistence.

## MCP

Start the server:

```bash
npm run contextgraph -- mcp
```

The MVP exposes:

- `get_context_status`
- `get_relevant_context`

The server uses stdio. Logs and diagnostics are written to stderr so stdout remains reserved for the MCP protocol.

## MVP Limits

The first version does not include watch mode, historical session import, embeddings, vector databases, remote LLM extraction, rule conflict detection, UI, VS Code extension, Codex sidebar, cloud sync, or team permissions.

Historical session import is the required Phase 2. It should import existing project-related Codex sessions through an explicit, redacted, auditable, summary-first workflow so existing projects become useful immediately after initialization.

Phase 2 must also build a project tool profile from historical sessions and local configuration. The profile should tell a new agent which MCP servers, skills, plugins/connectors, browser automation tools, document/PDF/spreadsheet tools, and test tools were useful for this project, including evidence, last-used time, confidence, and known failures.
```

- [ ] **Step 3: Run full verification**

```bash
npm run build
npm test
npm run check
```

Expected: all commands pass.

- [ ] **Step 4: Commit**

```bash
git add README.md tests/integration/e2e.test.ts
git commit -m "docs: add README and end-to-end workflow test"
```

## Task 12: final audit before implementation is called complete

**Files:**
- Inspect all source files
- Inspect `README.md`
- Inspect `docs/process/local-issues/0001-contextgraph-mvp.md`
- Inspect `docs/superpowers/specs/2026-06-15-contextgraph-mvp-design.md`
- Inspect `docs/product/01-prd.md`

- [ ] **Step 1: Verify Git identity and remote safety**

Run:

```bash
git config --local --get user.name
git config --local --get user.email
git remote -v
```

Expected:

```text
StarDreamG
StarDreamG@users.noreply.github.com
```

There should be no GitLab remote. If a remote exists, every URL must contain `github.com/StarDreamG`.

- [ ] **Step 2: Verify generated files do not leak runtime graph state**

Run:

```bash
git status --short
rg -n "(API[_-]?KEY|SECRET|TOKEN|PRIVATE KEY|PASSWORD|PASSWD)" .
```

Expected: no `.contextgraph/graph.db`, `.contextgraph/status.json`, `node_modules`, or secret values are staged or committed.

- [ ] **Step 3: Verify acceptance commands**

Run:

```bash
npm run build
npm run check
npm test
```

Expected: all pass.

- [ ] **Step 4: Verify CLI manually in a temporary project**

Run:

```bash
tmpdir="$(mktemp -d)"
git -C "$tmpdir" init -b main
printf '## 测试\n必须运行 npm test\n' > "$tmpdir/AGENTS.md"
CONTEXTGRAPH_CLI="<repo>/dist/cli/main.js"
(cd "$tmpdir" && node "$CONTEXTGRAPH_CLI" init)
(cd "$tmpdir" && node "$CONTEXTGRAPH_CLI" index)
(cd "$tmpdir" && node "$CONTEXTGRAPH_CLI" status)
(cd "$tmpdir" && node "$CONTEXTGRAPH_CLI" query "测试")
(cd "$tmpdir" && node "$CONTEXTGRAPH_CLI" handoff --agent codex --task "测试" --summary "fix failed test" --files "AGENTS.md")
```

Expected: init, index, status, query, and handoff all succeed. Remove the temp directory after verification.

- [ ] **Step 5: Verify Phase 2 requirement remains documented**

Run:

```bash
rg -n "Phase 2|import-sessions|存量|历史 session|MCP server|skills|工具环境画像" README.md docs/process/local-issues/0001-contextgraph-mvp.md docs/product/01-prd.md docs/superpowers/specs/2026-06-15-contextgraph-mvp-design.md
```

Expected: README, local issue, PRD, and design spec all state that historical session import is not MVP scope but is required Phase 2 work, and that Phase 2 must include a project tool profile for MCP servers, skills, plugins/connectors, and task-specific tools.

- [ ] **Step 6: Commit any audit fixes**

If verification requires code or documentation changes:

```bash
git add <changed-files>
git commit -m "fix: complete ContextGraph MVP verification"
```

If no changes are required, do not create an empty commit.

## Plan Self-Review

- Spec coverage: tasks cover project setup, local task source, default config, secret handling, SQLite schema, init, parsing, classification, indexing, status, query, handoff, MCP, README, verification, and the documented Phase 2 requirements for historical session import and project tool profiling.
- Placeholder scan: plan contains no unresolved placeholder markers or deferred implementation slots.
- Type consistency: shared domain types use `GraphStatus`, `Reliability`, `ContextGraphConfig`, `SourceRecord`, `BlockRecord`, `NodeRecord`, `QueryResult`, and `StatusSnapshot`; later tasks refer to those names consistently.
- Scope check: watch mode, historical session import implementation, project tool profile implementation, remote LLM, embeddings, UI, global npm usage, Docker, and GitLab remote usage remain outside the MVP; historical session import and project tool profiling remain mandatory Phase 2 work.
