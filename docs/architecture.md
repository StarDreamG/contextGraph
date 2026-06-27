# ContextGraph Architecture

ContextGraph is a local-first project experience index for coding agents.

Use CodeGraph for code facts.
Use ContextGraph for project experience facts.

ContextGraph is not a source-code knowledge graph. It does not parse source-code ASTs, provide call chains, resolve symbol references, find interface implementations, or analyze Spring Bean injection. Those belong to CodeGraph, Sourcegraph, LSP, IDE indexes, and language-aware code intelligence tools.

ContextGraph indexes the project knowledge that coding agents usually miss when they rely on narrow `grep` / `read` loops:

- agent instructions
- project rules
- development workflows
- testing requirements
- handoff notes
- historical failures and fixes
- decisions
- environment and deployment notes
- model / agent usage conventions
- interface contracts
- high-value source comments that express operational knowledge

## Current Level 0 Architecture

```text
agent-facing sources
  -> scanner
  -> parser
  -> block splitter
  -> classifier
  -> priority assessment
  -> relationship builder
  -> SQLite storage + FTS
  -> CLI / MCP query surface
```

Current source classes include README, AGENTS.md, CLAUDE.md, docs, Cursor rules, tests, Bruno collections, package metadata, and handoff summaries.

Current storage is local SQLite:

- `sources`: indexed files and hashes
- `blocks`: traceable context units with line ranges
- `nodes`: typed experience facts
- `edges`: relationships between experience facts
- `sessions`: agent handoff summaries
- `status`: freshness and reliability metadata
- `nodes_fts`: FTS5 search index

All indexed content is local. Secret redaction runs before content is written to SQLite.

## Trust Layer

Status and freshness are part of the trust layer, not optional display.

`contextgraph status` compares the current project state with the indexed state:

- current Git HEAD
- indexed Git HEAD
- current source set
- indexed source set
- source content hashes
- failed blocks

Query and brief results must show source, type, confidence/status, priority, and freshness. A stale context index must be visible to the agent before it acts.

## Query Architecture

Level 0 query flow:

```text
natural language task
  -> normalize
  -> infer intent
  -> extract entities
  -> expand queries
  -> FTS / Chinese fragment retrieval
  -> deduplicate
  -> rerank by priority, type, confidence, and match quality
  -> return traceable results
```

`get_relevant_context` in MCP must use the same query plan as the CLI. It must not rely on one raw FTS query.

If the original query misses but an expanded query hits, results include the matched query. If all queries miss, ContextGraph returns the query plan and suggestions instead of a silent empty result.

## Optional Source: Swagger / OpenAPI

Swagger / OpenAPI belongs to ContextGraph when it acts as an interface contract.

It does not make ContextGraph a backend source-code graph. It provides contract facts that help agents understand API boundaries before changing code, tests, deployment configuration, or client integrations.

Planned `v0.2.x` command:

```bash
contextgraph index --preset api
```

Planned default scan patterns:

- `openapi.json`
- `openapi.yaml`
- `swagger.json`
- `swagger.yaml`
- `docs/**/openapi*.json`
- `docs/**/swagger*.yaml`

The OpenAPI parser should extract:

- endpoint
- method
- path
- request parameters
- request body
- response schema
- tags
- deprecated status

Planned node types:

- `ApiEndpoint`
- `ApiSchema`
- `ApiParameter`
- `ApiResponse`
- `ApiContract`

API contract nodes should be recallable from `query` and `brief`. Their priority should be higher than ordinary README prose because contract documents are usually closer to source-of-truth interface behavior.

## Optional Source: Source Comments

Source comments belong to ContextGraph only when they express project experience, operational constraints, interface contracts, risks, compatibility notes, or testing/deployment requirements.

Source comments do not turn ContextGraph into a source-code graph:

- no AST semantic analysis
- no call chain analysis
- no symbol references
- no interface implementation analysis
- no Spring Bean injection analysis
- no ordinary code implementation indexing

Planned `v0.2.x / v0.3.x` command:

```bash
contextgraph index --preset source-comments
```

The preset must not be enabled by default for every project. Users must opt in through a preset or explicit configuration.

Planned language coverage:

- Java
- JavaScript
- TypeScript
- Vue
- Python
- Go

Only high-value comments are retained. Matching signals include:

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

Planned SourceComment classifications:

- `Rule`
- `Risk`
- `Failure`
- `Fix`
- `EnvironmentFact`
- `Decision`
- `CompatibilityNote`
- `Todo`
- `DeprecatedNote`

SourceComment nodes default to:

- `status=candidate`
- `confidence=medium`
- source type shown as `source_comment`
- source file preserved
- line range preserved

Query results must clearly show that a hit came from a source comment. Agents must not treat stale comments as confirmed rules unless they are reinforced by confirmed docs, handoff records, tests, or explicit user approval.

## Embedding And Semantic Edges

Embedding is planned as an optional `v0.3.x` layer. It is not a default dependency and must not be required for Level 0.

Embedding has two roles:

- semantic search for query recall
- candidate semantic edge discovery between project experience blocks

Planned embedding associations:

- document rule ↔ source comment
- OpenAPI endpoint ↔ test script
- OpenAPI endpoint ↔ handoff experience
- OpenAPI endpoint ↔ environment configuration

Candidate semantic edge types:

- `SEMANTICALLY_RELATED`
- `MAY_APPLY_TO`
- `POSSIBLY_REINFORCES`
- `POSSIBLY_CONFLICTS`

Candidate edges must include score, provider, model, status, and source block hashes. They are not confirmed edges. Confirmed edges can only come from explicit rules, user confirmation, handoff statements, test validation, or validated LLM extraction.

## Non-Goals

ContextGraph must not become:

- a source-code AST graph
- a Sourcegraph or CodeGraph replacement
- a language server
- a cloud knowledge base
- a required vector database
- a required LLM runtime
- a tool that uploads project data by default
- a tool that calls models during every query

The architecture goal is narrow and durable: give coding agents a traceable, freshness-aware memory of project experience before they act.

## Engineering Priority

The architecture should be implemented in this order:

1. Level 0 Hardening
   - MCP long-process reload / lazy refresh: first slice implemented through `reload_contextgraph`
   - MCP diagnostics: first slice implemented through `diagnose_contextgraph`
   - CLI and MCP state consistency: first slice uses lazy status reads on every MCP tool call
   - watcher: pending
   - status split into Context / Embedding / Extractor: first slice implemented with disabled defaults
   - stable query result fields
   - stronger Chinese trigram / LIKE fallback
2. Brief Productization
   - make `contextgraph brief` the new-agent entrypoint
   - support task, file, and domain scoped briefs
   - show P0 rules, source of truth, required tests, environment warnings, recent handoff, deprecated/conflicting context, and known failures
3. Experience-to-Source Association
   - extract file paths, module names, and test commands from project experience sources
   - build `RELATED_TO_FILE`, `APPLIES_TO`, and `REQUIRES_TEST`
   - add file/module scoped query without claiming code intelligence
4. Project Detector + Presets
   - `basic`: AGENTS, README, docs, handoff, config, test docs
   - `project`: package, pom, docker, bruno, playwright, openapi, common entrypoints, deployment config, scripts
   - `api`: OpenAPI / Swagger
   - `source-comments`: high-value comments only
   - `source`: explicit user confirmation, still not a code graph
5. Embedding
   - optional, cached, local-first, and only after Level 0 and association features are stable
6. LLM Extractor
   - optional, local-first, cached, candidate by default, schema validated, and never used at query time by default

This order is intentional. Embedding and LLM extraction must not mask stale MCP state, unclear diagnostics, weak brief output, unstable query fields, or unsafe default indexing.
