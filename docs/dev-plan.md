# ContextGraph Development Plan

## Goal

ContextGraph will evolve from a keyword-first local index into a semantic context index for coding agents. The implementation must stay layered: Level 0 remains fast and dependency-light, while embedding and extractor capabilities are optional add-ons that read and write local SQLite state.

ContextGraph must remain a project experience index, not a source-code knowledge graph. CodeGraph, Sourcegraph, LSP, IDE indexes, and tree-sitter based tools own code facts such as symbols, references, call chains, implementations, and AST-level structure. ContextGraph owns agent-facing project experience: rules, workflows, handoffs, failures, fixes, decisions, test requirements, environment notes, deployment constraints, and tool usage history.

The product opportunity is to stop coding agents from treating a local README or a single grep hit as the whole project. ContextGraph should show the broader operational memory around a task, with priority, provenance, freshness, and reliability.

AGENTS.md should remain the human-readable entrypoint for agents. ContextGraph is the indexed global view behind that entrypoint: it stores small, traceable, queryable experience blocks and tells agents whether those blocks are current enough to trust.

## Architecture Levels

## Current Engineering Priority

The next work should be ordered by trust and usability, not by model sophistication.

1. Level 0 Hardening
   - MCP long-process reload / lazy refresh: first slice implemented with `reload_contextgraph`
   - MCP diagnostics: first slice implemented with `diagnose_contextgraph`
   - CLI and MCP state consistency: first slice uses lazy status reads on every MCP tool call
   - watcher
   - status split into Context / Embedding / Extractor: first slice implemented with disabled defaults
   - stable query result fields
   - stronger Chinese trigram / LIKE fallback
2. Brief Productization
   - `contextgraph brief`
   - `contextgraph brief --task "修改区块链附件上传"`
   - `contextgraph brief --file ...`
   - `contextgraph brief --domain blockchain`
3. Experience-to-Source Association
   - extract file paths, module names, and test commands from docs, handoff, and tests
   - create `RELATED_TO_FILE`, `APPLIES_TO`, and `REQUIRES_TEST`
   - add `query --file` and `query --module`
4. Project Detector + Presets
   - `basic`
   - `project`
   - `api`
   - `source-comments`
   - `source`
5. Embedding
   - optional and only after the base layer is stable
6. LLM Extractor
   - optional, local-first, cached, candidate by default, and schema validated

Embedding must not hide weak status semantics, stale MCP state, unclear brief output, or unstable query fields.

### Level 0: Base Mode

Level 0 is the always-on foundation:

- Markdown / JSON / Text parser
- block splitting
- SQLite storage
- FTS5
- trigram-style Chinese fragment retrieval
- `status`
- `query`
- `handoff`
- stdio MCP

This level must work without network access, model providers, vector databases, or background services.

### Level 0.1: Query Planner Lite

MCP natural language queries must not depend on agents guessing the exact grep/FTS terms.

Current bug class:

- A natural language query such as `智策星隔离要求，不能占用哪些端口和资源` can miss.
- A shorter entity query such as `智策星隔离 61192` can hit.
- Root cause: raw query text is too sensitive to punctuation, long Chinese phrases, synonym choice, and keyword grouping.

Query Planner Lite flow:

```text
agent natural language query
-> normalize
-> intent inference
-> entity extraction
-> query expansion
-> FTS / trigram multi-query retrieval
-> deduplicate + rerank
-> grouped context with source/status/freshness
```

Required module:

```text
src/query/queryPlanner.ts
```

Required functions:

- `normalizeQuery(query)`
- `extractEntities(query)`
- `inferIntent(query)`
- `expandQueries(query)`
- `buildQueryPlan(query)`

`get_relevant_context` must call `buildQueryPlan`, execute retrieval for expanded queries, merge results, deduplicate by source and line range, rerank, and include matched query metadata. If all retrieval channels miss, it must return the query plan plus suggestions instead of a silent empty result.

`contextgraph explain-query "<query>"` should print Original Query, Normalized Query, Inferred Intents, Expected Types, Extracted Entities, Expanded Queries, and Retriever Plan.

### Level 0.5: MCP Lifecycle And Index Preset Hardening

Real project usage showed that the next implementation slice should improve the base experience before adding embedding or extractor work.

Observed symptoms:

- `contextgraph init` and `contextgraph index` can succeed in the terminal while the IDE-managed MCP server still reports an uninitialized project.
- CLI reads the latest `.contextgraph/graph.db` because it is a short-lived process, but MCP may be a long-running stdio process that started before `.contextgraph` existed.
- Initial queries may return little useful project shape because the default source set focuses on docs, tests, rules, and configuration rather than source code.
- Static defaults do not adapt to project type. For example, a JS/Vue project may require `src/**/*.vue`, `server/**/*.js`, Vite config, Docker Compose files, and Bruno API tests before the index becomes useful.
- Expanding sources manually to include broad source globs can index thousands of files and create a much larger database, which raises noise, performance, and storage concerns.

Required design response:

- MCP tools must not cache an uninitialized startup state forever.
- MCP calls should lazily re-check `.contextgraph/config.json`, `.contextgraph/graph.db`, and `lastIndexedAt`.
- MCP status output should include `projectRoot`, `dbPath`, initialization state, index timestamp, source/block/node/edge counts, and actionable next steps.
- Add an MCP reload tool, tentatively `reload_contextgraph`, to force config and database state refresh without requiring an IDE restart when the host supports long-lived MCP sessions.
- Add clear diagnostics when reload is impossible because the IDE owns process lifecycle.
- Keep CLI and MCP state semantics aligned: if CLI status is fresh, MCP should either show the same state or explain why the MCP process cannot refresh.
- Add watcher support for local freshness only.
- Split status into Context / Embedding / Extractor sections.
- Stabilize query result fields: source, line range, type, priority, confidence, status, freshness, and matched query.
- Strengthen Chinese trigram / LIKE fallback.

This work is still Level 0: it must not introduce model providers, network calls, vector databases, or query-time LLM use.

### Level 0.6: Brief Productization

`brief` is the product entrypoint for a new agent entering a project. It should answer what the agent must know before acting.

Target commands:

```bash
contextgraph brief
contextgraph brief --task "修改区块链附件上传"
contextgraph brief --file src/blockchain/upload.ts
contextgraph brief --domain blockchain
```

Target sections:

- P0 Rules
- Current Source of Truth
- Required Tests
- Deployment / Environment Warnings
- Recent Handoff
- Deprecated / Conflicting Context
- Known Failure Modes
- Related Files

This is more important than embedding because it directly supports the root product goal: stop new agents from acting on narrow grep/read results.

### Level 0.7: Experience-to-Source Association

This stage links project experience to code locations without becoming a code graph.

Allowed:

- extract file paths from docs, handoff, tests, and session summaries
- extract module names from text
- extract test commands and test file paths
- infer that a rule, failure, fix, or test requirement applies to a file/module when the source text says so
- support `query --file <path>`
- support `query --module <name>`

Relations:

- `RELATED_TO_FILE`
- `APPLIES_TO`
- `REQUIRES_TEST`
- `MENTIONS_MODULE`

Not allowed:

- AST parsing for semantics
- call chains
- symbol references
- interface implementations
- Spring Bean injection analysis

### Level 0.8: Project Detector And Presets

Default indexing should be safe and useful, not greedy.

Preset plan:

- `basic`: AGENTS, README, docs, handoff, config, test docs
- `project`: package, pom, docker, bruno, playwright, openapi, common project entrypoints, deployment config, scripts
- `api`: OpenAPI / Swagger
- `source-comments`: high-value comments only
- `source`: explicit user confirmation, still not a code graph

`source` must have scale warnings, strong excludes, and a clear rollback path.

### Level 1: Embedding Mode

Level 1 comes after Level 0 hardening, brief productization, experience-to-source association, and presets. It adds optional semantic search:

- local embedding provider interface
- `embeddings` SQLite table
- incremental embedding by `block_hash`
- semantic search over cached vectors
- hybrid search: FTS + trigram + embedding
- candidate semantic edge discovery between project experience blocks
- provider failure fallback to Level 0

Commands:

```bash
contextgraph embedding enable --provider ollama --model bge-m3
contextgraph embedding disable
contextgraph embedding status
contextgraph embedding rebuild
```

Provider ids:

- `none`
- `ollama`
- `local-onnx`
- `openai-compatible-local-endpoint`

The first implementation slice should add config, schema, CLI status, provider interface, and pending work detection before adding full provider integrations.

Embedding is not only for query-time semantic recall. It should also build candidate semantic edges between existing project experience blocks after indexing. These edges help graph expansion surface context that a narrow grep/read loop would miss.

### Level 2: Local LLM Extract Mode

Level 2 is deliberately after embedding and base governance. It adds optional structured extraction from high-value context:

- local extractor provider interface
- high-value block selection
- structured JSON output
- zod/schema validation
- extracted item storage
- candidate-first governance status

Commands:

```bash
contextgraph extractor enable --provider ollama --model qwen2.5:7b
contextgraph extractor disable
contextgraph extractor status
contextgraph extractor rebuild
```

Extractor output shape:

```json
{
  "items": [
    {
      "type": "Rule | Failure | Fix | Decision | TestRequirement | Risk",
      "title": "string",
      "content": "string",
      "appliesTo": ["string"],
      "sourceBlockId": "string",
      "confidence": 0.0,
      "status": "candidate",
      "relations": [
        {
          "target": "string",
          "relation": "CONFLICTS | SUPERSEDES | REINFORCES | CAUSES | FIXED_BY | REQUIRES | VALIDATES",
          "confidence": 0.0
        }
      ]
    }
  ]
}
```

Automatic extractor output defaults to `candidate`. Content from AGENTS.md, human notes, or explicit handoff records may receive higher confidence, but still should not become `confirmed` without an explicit approval path. LLM output must keep `sourceBlockId`, pass schema validation, and remain traceable to original text. Parse failures should discard that output and record a warning.

### Level 3: Governance Mode

Level 3 uses indexed and extracted context to support agent safety:

- conflicting rule detection
- stale rule detection
- pre-change risk prompts
- required tests recommendation
- stale context warning
- future `contextgraph approve` flow for candidate items

## Incremental Execution

Every derived artifact must bind to the source `block_hash`.

Embedding rules:

- If `block_hash` is unchanged for `(block_id, provider, model)`, skip embedding.
- If provider, model, dimensions, or `block_hash` changed, mark embedding stale.
- `embedding rebuild` may force recomputation, but normal `index` must stay incremental.

Extractor rules:

- If `block_hash` is unchanged for `(block_id, provider, model)`, skip extraction.
- If a block is not high-value, do not enqueue it for extraction.
- If provider fails, record failed status and keep Level 0 usable.
- LLM extractors run only during index, handoff, rebuild, or background extraction, never during query-time full-project reasoning.

## SQLite Schema Plan

Embedding storage:

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  block_id TEXT NOT NULL,
  node_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector BLOB NOT NULL,
  block_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (block_id, provider, model)
);
```

Candidate semantic edge storage:

```sql
CREATE TABLE IF NOT EXISTS semantic_edges (
  id TEXT PRIMARY KEY,
  from_block_id TEXT NOT NULL,
  to_block_id TEXT NOT NULL,
  from_node_id TEXT,
  to_node_id TEXT,
  relation TEXT NOT NULL,
  score REAL NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  block_hash_pair TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Allowed candidate relations:

- `SEMANTICALLY_RELATED`
- `SAME_DOMAIN`
- `MAY_APPLY_TO`
- `POSSIBLY_CONFLICTS`
- `POSSIBLY_REINFORCES`

Candidate semantic edges are not confirmed graph truth. They must include `score`, `provider`, `model`, and `status`, and query/brief output must label them as candidates when used for expansion.

Extractor storage should be added when Level 2 begins:

```sql
CREATE TABLE IF NOT EXISTS extracted_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  applies_to TEXT NOT NULL,
  source_block_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Environment facts can start as structured nodes plus metadata, but the target table is:

```sql
CREATE TABLE IF NOT EXISTS environment_facts (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  purpose TEXT NOT NULL,
  source_block_id TEXT NOT NULL,
  last_verified_at TEXT,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Provider run state can be tracked through the existing `status` table first. Add a dedicated run table only if retry history or failure diagnostics become too large for status metadata.

## Config Plan

Provider configuration must be local, explicit, and auditable:

```json
{
  "embedding": {
    "enabled": false,
    "provider": "none",
    "model": null
  },
  "extractor": {
    "enabled": false,
    "provider": "none",
    "model": null
  }
}
```

Remote or OpenAI-compatible endpoints must require explicit configuration. Defaults must not upload project data or call remote services.

## Provider Interfaces

Embedding provider contract:

```ts
interface EmbeddingProvider {
  id: string;
  model: string;
  dimensions(): Promise<number>;
  embed(input: Array<{ blockId: string; text: string }>): Promise<Array<{
    blockId: string;
    vector: Float32Array;
  }>>;
}
```

Extractor provider contract:

```ts
interface ExtractorProvider {
  id: string;
  model: string;
  extract(input: Array<{
    blockId: string;
    text: string;
    sourcePath: string;
  }>): Promise<{
    items: Array<{
      type: "Rule" | "Failure" | "Fix" | "Decision" | "TestRequirement" | "Risk";
      title: string;
      content: string;
      appliesTo: string[];
      sourceBlockId: string;
      confidence: number;
      status: "candidate";
    }>;
  }>;
}
```

Provider implementations must be replaceable modules. ContextGraph must not bundle model weights.

## High-Value Block Selection

Extractor should only process blocks that match at least one signal:

- contains “必须 / 禁止 / 不允许 / should / must / never”
- contains “失败 / 报错 / error / failed / exception”
- contains “修复 / fix / resolved / 解决”
- contains “决定 / decision / ADR / 采用 / 选择”
- comes from handoff or session summary
- comes from AGENTS.md, CLAUDE.md, Cursor rules, docs/failures.md, or docs/decisions.md

This selector must be deterministic and test-covered before LLM provider integration.

## Knowledge Domain And Trust Model

Knowledge Domain organizes project experience by task area. Initial domains should include:

- `blockchain`
- `deployment`
- `testing`
- `frontend`
- `backend`

The domain detector should use deterministic signals first:

- task text
- headings and source paths
- file path prefixes
- known environment names
- test command names
- explicit tags in frontmatter or handoff metadata

`query` and `brief` should infer the most likely domain from the task and use it as a ranking boost, not as a hard filter. P0 Rules remain globally important and must be shown before lower-priority same-domain context.

Priority:

- `P0`: hard rules, safety constraints, source-of-truth boundaries, production/account/network/security constraints, and non-negotiable project rules.
- `P1`: required flows, required tests, known failure modes, fixes, and high-risk operational context.
- `P2`: useful decisions, conventions, environment notes, project shape, and supporting context.

Status:

- `confirmed`: explicit project rule, handoff statement, verified test requirement, manual note, approved extractor item, or user-confirmed relationship.
- `candidate`: deterministic extraction, embedding edge discovery, or unapproved LLM extractor output.
- `deprecated`: superseded documentation, old process, or known obsolete environment fact.
- `conflict`: competing facts or rules cannot both be true.
- `stale`: source is out of date, unverified for too long, or not aligned with current Git/context index.

`supersedes` should connect newer documents, handoffs, environment facts, and rules to the older items they replace. Deprecated items should still be searchable, but brief/query must clearly mark them and avoid treating them as current source of truth.

## Task-Aware Brief Plan

Add task-aware brief:

```bash
contextgraph brief "维护多客户区块链集成"
```

The command should infer Knowledge Domain, then assemble:

- `P0 Rules`
- `Current Source of Truth`
- `Environment Facts`
- `Required Flow`
- `Required Tests`
- `Deprecated Docs`
- `Known Failure Modes`
- `Related Files`

Blockchain example:

- A non-blockchain engineer maintaining blockchain integration across multiple clients should retrieve boundaries, endpoints, txid rules, deprecated docs, failure modes, related files, and required tests before changing code.
- The brief must distinguish confirmed rules from candidate relationships.
- Environment facts should include address, purpose, source, `last_verified_at`, and status.
- Deprecated docs should be included only as warnings, especially when `supersedes` points to a current source of truth.

## Query Plan

`contextgraph query` must never call a model at request time.

Future hybrid query flow:

```text
FTS5 hits
+ trigram hits
+ embedding similarity hits
-> merge and deduplicate
-> score by priority, confidence, freshness, source quality, and match score
-> graph expansion:
   - always pull linked P0 rules
   - pull required tests
   - pull environment facts
   - pull failures and fixes
   - pull deprecated docs as warnings
   - pull source-of-truth and supersedes chains
-> return source, line range, domain, priority, confidence, status, freshness, and reliability warnings
```

If embedding is disabled, stale, or failed, query continues with FTS + trigram. If extractor is disabled, query still returns Level 0 nodes and blocks.

Candidate semantic edges may expand recall, but they must not upgrade a candidate fact into a confirmed fact. Confirmed edges can only come from explicit rules, user confirmation, handoff statements, test verification, or structured LLM extractor output that passes schema validation and approval rules.

## Embedding Candidate Edge Discovery

After embeddings are available, ContextGraph should discover semantic edges incrementally:

1. Generate embedding for each new or changed block/node.
2. Bind embedding cache to `block_hash`.
3. For a new or changed block, compare only the relevant candidate neighborhood instead of recomputing the whole graph.
4. If similarity exceeds a configured threshold, create or update a candidate semantic edge.
5. Store `score`, `provider`, `model`, `status`, and `block_hash_pair`.
6. Mark edges stale when either side's `block_hash` changes.

Candidate edge types:

- `SEMANTICALLY_RELATED`: two experience blocks discuss similar concepts.
- `SAME_DOMAIN`: two blocks likely belong to the same Knowledge Domain.
- `MAY_APPLY_TO`: a rule or failure may apply to a file/module/domain.
- `POSSIBLY_CONFLICTS`: two blocks may disagree.
- `POSSIBLY_REINFORCES`: two blocks likely support the same rule or workflow.

Confirmed edge sources remain stricter:

- explicit rule syntax or deterministic path/test extraction
- user confirmation
- handoff explicit statement
- test verification
- LLM extractor structured judgment, stored as validated output with governance status

## MCP Lifecycle Plan

MCP is a different lifecycle from CLI:

- CLI starts, reads current files, exits.
- MCP may start before initialization and remain alive under IDE control.

The MCP server should therefore treat project state as dynamic. Each tool call should either read current state or consult a refreshable project-state cache keyed by `projectRoot`.

Planned MCP tools:

- `get_context_status`: return current state and diagnostics.
- `get_relevant_context`: use current state or return actionable initialization/indexing guidance.
- `reload_contextgraph`: refresh config/database handles and clear stale initialization errors.

Status diagnostics should include:

```json
{
  "projectRoot": "/path/to/project",
  "dbPath": "/path/to/project/.contextgraph/graph.db",
  "configPath": "/path/to/project/.contextgraph/config.json",
  "initialized": true,
  "lastIndexedAt": "2026-06-26T00:00:00.000Z",
  "mcpProcessStartedAt": "2026-06-26T00:00:00.000Z",
  "suggestedCommands": ["contextgraph index"],
  "requiresHostRestart": false
}
```

If MCP cannot recover because the host keeps an old stopped process or stale tool registry, the status response should say that plainly and recommend restarting the MCP host or IDE.

## Index Preset Plan

Indexing should become profile-driven instead of requiring users to manually edit raw source globs.

Before expanding presets, ContextGraph should detect the project shape from marker files and directories:

- JS/Node/Vue: `package.json`, `vite.config.*`, `src/`, `server/`, `bruno/`, `docker-compose*.yml`
- Python: `pyproject.toml`, `requirements.txt`, `src/`, `app/`, `tests/`
- Java/Maven: `pom.xml`, `src/main`, `src/test`
- Go: `go.mod`, `cmd/`, `internal/`, `pkg/`
- Rust: `Cargo.toml`, `src/`
- Docs-heavy or agent-rule-only repositories: `README.md`, `AGENTS.md`, `docs/`

Presets:

- `basic`: README, AGENTS/CLAUDE, docs, Cursor rules, tests, package/build metadata, handoff/session summaries.
- `project`: `basic` plus detector-selected application entrypoints, routing, API/proxy files, deployment files, scripts, framework configs, and top-level source summaries.
- `source`: controlled broad source indexing for code-heavy exploration.

Example JS/Vue `project` defaults:

- `src/**/*.{js,ts,vue,jsx,tsx}`
- `server/**/*.{js,ts,mjs,cjs}`
- `scripts/**/*.{js,ts,mjs,cjs}`
- `tests/**/*`
- `bruno/**/*`
- `vite.config.*`
- `package.json`
- `Dockerfile*`
- `docker-compose*.yml`

Detector-selected defaults should be explainable. `contextgraph status` or `doctor` should show the detected project type, selected preset, and the source globs that came from the detector.

The `source` preset must include scale protections:

- default excludes for dependencies, build outputs, generated files, lock files, binary/static assets, vendored code, local databases, and `.contextgraph/**`
- file count and estimated database growth warning before indexing very large projects
- visible counts after index: sources, blocks, nodes, edges, skipped files, ignored files
- ability to revert from `source` back to `basic` or `project`

The config shape can evolve toward:

```json
{
  "indexing": {
    "preset": "project",
    "includeSource": false,
    "maxFileBytes": 262144,
    "warnAboveFiles": 1000
  }
}
```

Raw `sources` and `ignore` arrays may remain as advanced overrides, but presets should be the normal user-facing control.

If detection confidence is low, ContextGraph should choose `basic`, show a warning, and suggest candidate presets instead of guessing a broad source scan.

## Source Association Plan

ContextGraph should associate project experience with source files and modules, but it should not parse source code into a code intelligence graph.

Non-goals for this layer:

- no AST parsing requirement
- no symbol table
- no call graph
- no interface implementation graph
- no Spring/DI/container analysis
- no replacement for CodeGraph, Sourcegraph, LSP, or IDE indexes

Inputs:

- explicit file paths in docs, AGENTS/CLAUDE, Cursor rules, handoff, and imported session summaries
- directory names and module names mentioned in high-value blocks
- test commands and test file paths
- stack/framework marker files selected by the project detector

Relationships:

- `RELATED_TO_FILE`: a rule, failure, fix, decision, risk, command, or handoff mentions a concrete file or path.
- `APPLIES_TO`: a rule, decision, risk, or test requirement applies to a module, directory, package, or file.
- `REQUIRES_TEST`: a rule, fix, or module association points to a required test command or test file.
- `MENTIONS_MODULE`: a context item references a named module without enough confidence for `APPLIES_TO`.

Planned query commands:

```bash
contextgraph query --file src/example.ts
contextgraph query --module export
```

Expected result shape should keep the boundary clear:

- source path and line range for the context item
- relationship type such as `APPLIES_TO` or `REQUIRES_TEST`
- confidence and status
- priority and priority reason
- a note that this is project-experience context, not a code call graph

The first implementation can use deterministic extraction:

- path-like tokens: `src/...`, `server/...`, `docs/...`, `tests/...`, `*.java`, `*.ts`, `*.vue`, `*.py`, `*.go`, `*.rs`, `*.cpp`, `*.h`
- command-like test tokens: `npm test`, `pnpm test`, `vitest`, `playwright`, `mvn test`, `pytest`, `go test`, `cargo test`
- module signals from headings, bullet labels, and configured detector metadata

Extractor/LLM support may improve recall later, but query-time LLM use remains forbidden.

## Status Reliability Panel

`contextgraph status` should report independent freshness:

```text
Context index:        Fresh
Embedding index:      Stale
Embedding model:      bge-m3
Pending embeds:       12
Pending semantic edge blocks: 3
Candidate edges:      128
Confirmed edges:      42
Extractor index:      Disabled
Extractor model:      qwen2.5:7b
Pending extracts:     3
Candidate extracted nodes: 18
Confirmed extracted nodes: 4
Extraction failures:  0
Search mode:          FTS + trigram / hybrid
Overall reliability:  High / Medium / Low
```

Reliability rules:

- `High`: context index fresh, enabled derived indexes fresh, no critical failures.
- `Medium`: context index fresh but embedding or extractor stale/disabled for a mode that requested them.
- `Low`: context index stale, schema unavailable, or core index failed.

The status panel must make freshness part of the trust layer. It should report Context index freshness, Embedding index freshness, Candidate edge count, Confirmed edge count, and Pending semantic edge blocks.

## Security Requirements

These are non-negotiable:

- local-first by default
- default no network
- default no remote LLM
- no model weights in npm package
- ignore `.env`, private keys, certificates, dependencies, build output, and `.contextgraph/graph.db`
- redact secrets before writing to SQLite
- provider config must be auditable
- remote providers require explicit opt-in
- do not auto-read all private agent memories

## Explicit Non-Goals

Do not build these in the next phase:

- cloud sync
- team permissions
- complex UI
- built-in model weights
- mandatory vector database
- query-time LLM calls
- automatic import of all agent private memory

## Implementation Slices

1. Query Planner Lite
   - add `src/query/queryPlanner.ts`
   - add natural-language normalization, intent inference, entity extraction, and query expansion
   - make `get_relevant_context` use multi-query retrieval instead of one raw FTS query
   - add zero-result fallback with query plan and suggestions
   - add `contextgraph explain-query "<query>"`
   - add tests for `智策星隔离要求，不能占用哪些端口和资源`

2. Level 0 hardening
   - lazy re-check project initialization and database state on every MCP tool call: first slice implemented
   - add `reload_contextgraph`: first slice implemented
   - return projectRoot/dbPath/configPath/lastIndexedAt diagnostics from MCP status: first slice implemented
   - provide actionable messages for `not initialized`, `not indexed`, and `stale`: first slice implemented
   - add watcher
   - split status into Context / Embedding / Extractor with disabled defaults: first slice implemented
   - stabilize query result fields
   - formalize trigram Chinese fragment scoring and LIKE fallback
   - add tests for MCP started before init and then recovering after init/index

3. Brief productization
   - add task-aware brief input
   - add file-aware brief input
   - add domain-aware brief input
   - return P0 Rules, Current Source of Truth, Required Tests, Deployment / Environment Warnings, Recent Handoff, Deprecated / Conflicting Context, Known Failure Modes, and Related Files
   - add tests for P0-first ordering, stale warnings, task filtering, file filtering, and domain filtering

4. Source association and scoped query
   - extract file paths, module names, and test commands from high-value context
   - add `RELATED_TO_FILE`, `APPLIES_TO`, `REQUIRES_TEST`, and `MENTIONS_MODULE` relations
   - add `contextgraph query --file <path>`
   - add `contextgraph query --module <name>`
   - keep relationship output explicit that it is project-experience context, not code intelligence
   - add tests for path extraction, test command extraction, file query, and module query

5. Project detector and preset hardening
   - add `basic`, `project`, `api`, `source-comments`, and `source` presets
   - add project detector for JS/Node/Vue, Python, Java/Maven, Go, Rust, and docs-heavy repositories
   - add framework-aware default includes for detected project types
   - keep default indexing safe and useful for new-agent onboarding
   - require explicit source preset for broad code indexing
   - add scale warnings and stronger excludes
   - add tests for project detection, preset expansion, and large-project guardrails

6. Knowledge domain and trust semantics
   - add Knowledge Domain metadata and deterministic domain detection
   - support initial domains: `blockchain`, `deployment`, `testing`, `frontend`, `backend`
   - normalize priority around `P0`, `P1`, and `P2` for brief/query
   - add status semantics: `confirmed`, `candidate`, `deprecated`, `conflict`, `stale`
   - add `supersedes` relation and deprecated-doc handling
   - add `EnvironmentFact`
   - add tests for P0-first ordering, domain inference, status rendering, and supersedes behavior

7. Embedding interface and state
   - add config shape
   - add `embeddings` table
   - add `contextgraph embedding status`
   - add stale and pending calculations
   - add tests proving disabled mode preserves existing behavior

8. Embedding semantic edge discovery
   - generate embeddings for blocks/nodes and bind them to `block_hash`
   - compute embeddings only for new or changed blocks
   - create candidate semantic edges above configured thresholds
   - add edge status, score, provider, and model fields
   - show Embedding freshness, Candidate edge count, Confirmed edge count, and Pending semantic edge blocks in status
   - add tests proving candidate edges do not become confirmed edges

9. Embedding execution
   - add first provider implementation behind explicit enablement
   - add incremental embedding by `block_hash`
   - add rebuild command
   - add hybrid score merge

10. Extractor interface and high-value selector
   - add deterministic selector
   - add extractor config and status
   - add schema validation
   - add tests for selector and provider failure fallback

11. Extractor execution
   - add first provider implementation behind explicit enablement
   - store candidate extracted items
   - expose candidate items in brief/query without treating them as confirmed

12. Governance
   - conflict detection
   - stale rule detection
   - required tests recommendation
   - approval flow for candidate items

## Acceptance Criteria

Future implementation work must satisfy:

1. Not enabling embedding or extractor leaves all current commands working.
2. MCP started before `init` can recover after `init` / `index` through lazy refresh or `reload_contextgraph`.
3. MCP diagnostics clearly explain project path, database path, initialization state, index freshness, and required next action.
4. `explain-query` shows normalized query, inferred intent, extracted entities, expanded queries, and retriever plan.
5. MCP `get_relevant_context` uses Query Planner Lite and does not rely on a single raw FTS query.
6. If original query misses but expanded query hits, results are returned and marked with the matched expanded query.
7. If all retrieval channels miss, response includes query plan and suggestions.
8. Project detection selects useful defaults for common stacks without manual source editing.
9. JS/Vue/Node projects index meaningful app entrypoints under the `project` preset without scanning dependencies or build output.
10. Default indexing does not unexpectedly scan an entire source tree.
11. Broad source indexing is an explicit preset with scale warnings and strong excludes.
12. ContextGraph documentation and command output clearly state that it complements, rather than replaces, CodeGraph, Sourcegraph, LSP, and IDE indexes.
13. File/module scoped queries return related rules, failures, fixes, test requirements, and handoffs without claiming code call-graph knowledge.
14. Knowledge Domain inference can route a blockchain, deployment, testing, frontend, or backend task toward relevant experience without hiding global P0 rules.
15. `contextgraph brief "<task>"` returns P0 Rules, Current Source of Truth, Environment Facts, Required Flow, Required Tests, Deprecated Docs, Known Failure Modes, and Related Files.
16. Environment facts include address, purpose, source, `last_verified_at`, status, confidence, and domain.
17. Superseded docs are marked `deprecated` and linked to current source of truth.
18. Enabling embedding only computes vectors for new or changed blocks.
19. Unchanged `block_hash` values do not trigger repeated embedding.
20. Embedding discovery creates candidate semantic edges with score, provider, model, and status.
21. Candidate semantic edges never count as confirmed edges without explicit confirmation, handoff evidence, test verification, or validated extractor judgment.
22. Enabling extractor only processes high-value blocks.
23. Provider failures downgrade to base query instead of breaking `query`.
24. Status clearly separates Context index, Embedding index, Extractor index, Candidate edge count, Confirmed edge count, and Pending semantic edge blocks.
25. Query results include source, line range, domain, priority, confidence, status, and freshness.
26. Every new feature has focused tests.
