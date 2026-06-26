# ContextGraph Development Plan

## Goal

ContextGraph will evolve from a keyword-first local index into a semantic context index for coding agents. The implementation must stay layered: Level 0 remains fast and dependency-light, while embedding and extractor capabilities are optional add-ons that read and write local SQLite state.

## Architecture Levels

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

### Level 0.5: MCP Lifecycle And Index Preset Hardening

Real project usage showed that the next implementation slice should improve the base experience before adding embedding or extractor work.

Observed symptoms:

- `contextgraph init` and `contextgraph index` can succeed in the terminal while the IDE-managed MCP server still reports an uninitialized project.
- CLI reads the latest `.contextgraph/graph.db` because it is a short-lived process, but MCP may be a long-running stdio process that started before `.contextgraph` existed.
- Initial queries may return little useful project shape because the default source set focuses on docs, tests, rules, and configuration rather than source code.
- Expanding sources manually to include broad source globs can index thousands of files and create a much larger database, which raises noise, performance, and storage concerns.

Required design response:

- MCP tools must not cache an uninitialized startup state forever.
- MCP calls should lazily re-check `.contextgraph/config.json`, `.contextgraph/graph.db`, and `lastIndexedAt`.
- MCP status output should include `projectRoot`, `dbPath`, initialization state, index timestamp, source/block/node/edge counts, and actionable next steps.
- Add an MCP reload tool, tentatively `reload_contextgraph`, to force config and database state refresh without requiring an IDE restart when the host supports long-lived MCP sessions.
- Add clear diagnostics when reload is impossible because the IDE owns process lifecycle.
- Keep CLI and MCP state semantics aligned: if CLI status is fresh, MCP should either show the same state or explain why the MCP process cannot refresh.
- Replace the single default source-list mindset with indexing presets: `basic`, `project`, and `source`.
- `basic` should remain small and safe.
- `project` should improve new-agent onboarding with common source entrypoints and deployment/runtime files.
- `source` should be explicit, bounded, and guarded by ignore rules plus scale warnings.

This work is still Level 0: it must not introduce model providers, network calls, vector databases, or query-time LLM use.

### Level 1: Embedding Mode

Level 1 adds optional semantic search:

- local embedding provider interface
- `embeddings` SQLite table
- incremental embedding by `block_hash`
- semantic search over cached vectors
- hybrid search: FTS + trigram + embedding
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

### Level 2: Local LLM Extract Mode

Level 2 adds optional structured extraction from high-value context:

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
      "status": "candidate"
    }
  ]
}
```

Automatic extractor output defaults to `candidate`. Content from AGENTS.md, human notes, or explicit handoff records may receive higher confidence, but still should not become `confirmed` without an explicit approval path.

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

## Query Plan

`contextgraph query` must never call a model at request time.

Future hybrid query flow:

```text
FTS5 hits
+ trigram hits
+ embedding similarity hits
-> merge and deduplicate
-> score by priority, confidence, freshness, source quality, and match score
-> return source, line range, confidence, status, and reliability warnings
```

If embedding is disabled, stale, or failed, query continues with FTS + trigram. If extractor is disabled, query still returns Level 0 nodes and blocks.

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

Presets:

- `basic`: README, AGENTS/CLAUDE, docs, Cursor rules, tests, package/build metadata, handoff/session summaries.
- `project`: `basic` plus common application entrypoints, routing, API/proxy files, deployment files, scripts, and top-level source summaries.
- `source`: controlled broad source indexing for code-heavy exploration.

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

## Status Reliability Panel

`contextgraph status` should report independent freshness:

```text
Context index:        Fresh
Embedding index:      Stale
Embedding model:      bge-m3
Pending embeds:       12
Extractor index:      Disabled
Extractor model:      qwen2.5:7b
Pending extracts:     3
Search mode:          FTS + trigram / hybrid
Overall reliability:  High / Medium / Low
```

Reliability rules:

- `High`: context index fresh, enabled derived indexes fresh, no critical failures.
- `Medium`: context index fresh but embedding or extractor stale/disabled for a mode that requested them.
- `Low`: context index stale, schema unavailable, or core index failed.

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

1. Level 0 hardening
   - formalize trigram Chinese fragment scoring
   - ensure query results always include source, line range, confidence, and status
   - split status into Context / Embedding / Extractor sections with disabled defaults

2. MCP lifecycle hardening
   - lazy re-check project initialization and database state on every MCP tool call
   - add `reload_contextgraph`
   - return projectRoot/dbPath/configPath/lastIndexedAt diagnostics from MCP status
   - provide actionable messages for `not initialized`, `not indexed`, `stale`, and `host restart required`
   - add tests for MCP started before init and then recovering after init/index

3. Index preset hardening
   - add `basic`, `project`, and `source` presets
   - keep default indexing safe and useful for new-agent onboarding
   - require explicit source preset for broad code indexing
   - add scale warnings and stronger excludes
   - add tests for preset expansion and large-project guardrails

4. Embedding interface and state
   - add config shape
   - add `embeddings` table
   - add `contextgraph embedding status`
   - add stale and pending calculations
   - add tests proving disabled mode preserves existing behavior

5. Embedding execution
   - add first provider implementation behind explicit enablement
   - add incremental embedding by `block_hash`
   - add rebuild command
   - add hybrid score merge

6. Extractor interface and high-value selector
   - add deterministic selector
   - add extractor config and status
   - add schema validation
   - add tests for selector and provider failure fallback

7. Extractor execution
   - add first provider implementation behind explicit enablement
   - store candidate extracted items
   - expose candidate items in brief/query without treating them as confirmed

8. Governance
   - conflict detection
   - stale rule detection
   - required tests recommendation
   - approval flow for candidate items

## Acceptance Criteria

Future implementation work must satisfy:

1. Not enabling embedding or extractor leaves all current commands working.
2. MCP started before `init` can recover after `init` / `index` through lazy refresh or `reload_contextgraph`.
3. MCP diagnostics clearly explain project path, database path, initialization state, index freshness, and required next action.
4. Default indexing does not unexpectedly scan an entire source tree.
5. Broad source indexing is an explicit preset with scale warnings and strong excludes.
6. Enabling embedding only computes vectors for new or changed blocks.
7. Unchanged `block_hash` values do not trigger repeated embedding.
8. Enabling extractor only processes high-value blocks.
9. Provider failures downgrade to base query instead of breaking `query`.
10. Status clearly separates Context index, Embedding index, and Extractor index freshness.
11. Query results include source, line range, confidence, and status.
12. Every new feature has focused tests.
