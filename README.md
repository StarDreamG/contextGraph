# ContextGraph

> Local-first operational memory for coding agents.
>
> ContextGraph gives coding agents the project experience that code graphs miss.

ContextGraph 是 coding agent 的本地项目经验记忆层。

It helps a new coding agent inherit project rules, required tests, deployment notes, known failures, fixes, handoffs, environment constraints, and agent workflow conventions before it starts changing code.

Use CodeGraph for code facts. Use ContextGraph for project experience facts.

## Why ContextGraph

Coding agents often enter a repository through narrow `grep` / `read` loops. They may see one README section, one `AGENTS.md` fragment, one handoff note, or one old document, then treat that partial context as the whole project truth.

`AGENTS.md` is the entry point. ContextGraph is the index, recall, status, handoff, and governance layer behind that entry point.

ContextGraph gives coding agents an operational memory that stays local, traceable, and freshness-aware.

## What It Is

ContextGraph indexes agent-facing project experience:

- project rules
- required tests
- deployment notes
- known failures and fixes
- decisions
- environment constraints
- handoff summaries
- agent workflow conventions
- high-value operational notes in Markdown, JSON, and text files

It stores this context locally in SQLite, redacts likely secrets before writing, and returns source-linked results with priority, status, and freshness.

## What It Is Not

ContextGraph is not:

- a source-code knowledge graph
- a CodeGraph replacement
- a Sourcegraph replacement
- an LSP replacement
- a cloud knowledge base
- a remote LLM wrapper
- a vector database
- a tool that uploads project data by default

| Tool layer | Focus |
| --- | --- |
| CodeGraph / Sourcegraph / LSP | code facts: classes, functions, references, call chains, symbols, dependencies |
| ContextGraph | project experience facts: rules, tests, deployment notes, pitfalls, fixes, handoff, environment constraints |

ContextGraph does not answer "who calls this function?" or "which class implements this interface?" CodeGraph, Sourcegraph, LSP, and IDE indexes own those questions.

## Install

Requirements:

- Node.js `>=22 <25`
- npm
- a local project directory

Install:

```bash
npm install -g @stardreamg/contextgraph
```

Or run from a checked-out development copy:

```bash
npm install
npm run build
npm run contextgraph -- status
```

## Quick Start

```bash
cd /path/to/project
contextgraph init
contextgraph index
contextgraph status
contextgraph brief
contextgraph query "部署前必须跑哪些测试"
```

Example status output:

```text
ContextGraph Status
────────────────────────────────
Project:        /path/to/project
Status:         Fresh
Reliability:    High
Search mode:    FTS + trigram
MCP server:     stopped
Watcher:        stopped
```

Example query output:

```text
ContextGraph Query
────────────────────────────────
Query: 部署前必须跑哪些测试
Status: Fresh
Reliability: High
Relevant Context:
[Test] Required tests
Priority: P1
Source: AGENTS.md:12-13
Content:
Before deployment, run npm test and npm run build.
```

## Agent Workflow

When a new coding agent enters a project, ask it to run:

```bash
contextgraph brief --task "接手项目"
contextgraph status
contextgraph query "当前任务的规约、测试要求和历史踩坑"
```

This gives the agent a task-shaped view of project rules, source-of-truth documents, required tests, known risks, and recent handoff context before it edits files.

## Commands

| Command | Purpose |
| --- | --- |
| `contextgraph init` | Create `.contextgraph/`, local SQLite state, config, and starter agent guidance. |
| `contextgraph index` | Scan configured local sources, redact secrets, split blocks, classify experience, and update SQLite + FTS. |
| `contextgraph status` | Show freshness, reliability, index counts, Git HEAD state, and enabled optional layers. |
| `contextgraph doctor` | Check project initialization, runtime, SQLite support, and index health. |
| `contextgraph brief` | Print a concise startup brief for a coding agent. |
| `contextgraph query "<task>"` | Retrieve relevant project experience for a natural-language task. |
| `contextgraph explain-query "<task>"` | Explain normalization, inferred intent, entities, expanded queries, and recall path. |
| `contextgraph handoff` | Record a local handoff summary for future agents. |
| `contextgraph mcp` | Start the local stdio MCP server. |

## Result Contract

`query` and `brief` results should be traceable enough for an agent to decide whether the context is safe to use.

Each result should show:

- source file and line range
- experience type
- priority
- confidence or status
- freshness

Status and freshness are part of the trust layer. They are not optional display fields.

## Optional Sources

ContextGraph can index source-adjacent project experience without becoming a source-code graph.

### Swagger / OpenAPI

Swagger and OpenAPI files are interface contracts. They belong in ContextGraph when they help agents understand API boundaries, deprecated endpoints, request/response expectations, testing requirements, or deployment integration notes.

Planned and current patterns include:

- `openapi.json`
- `openapi.yaml`
- `swagger.json`
- `swagger.yaml`
- `docs/**/openapi*.json`
- `docs/**/swagger*.yaml`

OpenAPI contracts should rank above ordinary README prose when they describe current interface behavior.

### Source Comments

Source comments are optional and must not be enabled as a broad default source scan.

ContextGraph should only retain high-value comments that express project experience, operational constraints, interface contracts, risks, compatibility notes, testing requirements, or deployment requirements.

Source comments do not make ContextGraph a code intelligence tool:

- no AST parsing
- no call chains
- no symbol references
- no interface implementation analysis
- no Spring Bean analysis

SourceComment results must preserve source file and line range, default to `candidate`, use medium confidence, and clearly display `source_comment` so an agent does not treat stale comments as confirmed project truth.

## MCP

Start the stdio MCP server:

```bash
contextgraph mcp
```

Specify a project root:

```bash
contextgraph mcp --project /path/to/project
```

Current MCP tools:

- `get_context_status`
- `get_relevant_context`

The MCP server uses stdio. Runtime logs go to stderr so stdout remains reserved for the MCP protocol.

## Security Model

ContextGraph is local-first by design:

- no upload by default
- no remote LLM calls by default
- no TCP server by default
- `query` does not call a model at runtime
- likely secrets are redacted before SQLite writes
- default excludes include `.env`, private keys, certificates, `node_modules`, `dist`, `.git`, and `.contextgraph/graph.db`

Optional future providers must be explicit opt-in and must degrade back to local FTS when unavailable.

## Current Status

Current package: `@stardreamg/contextgraph@0.1.2`

Level 0 closed loop:

```text
init -> index -> status -> query/brief -> MCP -> handoff
```

Implemented foundation:

- Markdown / JSON / Text parser
- block splitting
- secret redaction
- Rule / Test / Failure / Fix / Decision / Environment / Workflow / Preference / Note classification
- P0-P4 priority
- SQLite tables: `sources`, `blocks`, `nodes`, `edges`, `sessions`, `status`, FTS
- SQLite FTS5 + Chinese fallback
- Git HEAD / source hash freshness
- basic edges: `co_occurs_with` / `fixed_by`
- MCP stdio server

## Use Cases

### Safer Agent Handoff

A new agent can start by inheriting repository rules, test expectations, environment constraints, historical failures, and previous fixes instead of rediscovering them one file at a time.

### High-Risk Cross-System Changes

Projects with multiple clients, machines, deployment paths, or production/test differences often have old docs that can mislead agents. ContextGraph keeps the current operational facts queryable and freshness-aware.

### Portfolio Reconstruction

ContextGraph can help extract a sanitized engineering experience blueprint from private company work, then rebuild a public portfolio project in a different domain.

This use case must not copy company source code, leak customer data, expose real IPs/tokens/production paths, or preserve internal business details.

## Roadmap

All items below are planned unless explicitly listed in Current Status.

### Level 0 Hardening

- MCP lifecycle / project root detection
- `reload_contextgraph`
- MCP diagnostics: `projectRoot`, `dbPath`, `initialized`, `lastIndexedAt`, `nextStep`
- CLI/MCP status consistency
- brief productization
- watcher

### Project Detector And Presets

- `basic`
- `project`
- `api`
- `source-comments`
- `source` explicit opt-in

### Experience-To-Source Links

- `RELATED_TO_FILE`
- `APPLIES_TO`
- `REQUIRES_TEST`
- `contextgraph query --file <path>`
- `contextgraph query --module <name>`

### Optional Embedding Layer

- provider: `ollama`
- model example: `bge-m3`
- semantic search
- hybrid search
- semantic edge discovery
- unavailable provider degrades to FTS

### Optional Local LLM Extractor

- provider: `ollama`
- model example: `qwen2.5:7b`
- extract `Rule` / `Failure` / `Fix` / `Decision` / `TestRequirement` / `Risk` / `EnvironmentFact`
- default status is `candidate`
- query-time model calls remain out of scope

### Governance

- conflict detection
- stale rule warning
- `supersedes`
- candidate -> confirmed workflow
- required tests recommendation
- modification risk hints

## Development

```bash
npm install
npm run build
npm run check
npm test
npm pack --dry-run
```

Do not add default upload, default remote LLM calls, or default project-data export paths.

GitHub Actions runs the same build, type-check, test, and pack dry-run checks for pull requests and pushes to `main`.

## License

Apache-2.0. See [LICENSE](LICENSE).
