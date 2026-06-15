# ContextGraph MVP Design

## Status

Approved on 2026-06-15.

## Background

Coding agents repeatedly scan project files to rediscover conventions, commands,
tests, decisions, failures, fixes, and environment knowledge. This costs tool
calls and tokens, and different agents can reach inconsistent conclusions.

ContextGraph will pre-index stable project context into a local graph and expose
it through a CLI and MCP. Markdown and other project files are inputs; the graph
is the query interface; status is the trust layer.

## User Story

As a coding agent or developer, I want to index and query project knowledge
locally so that work starts from shared, current, traceable context instead of
repeated file discovery.

## MVP Goal

Deliver one runnable local workflow:

`init -> index -> status -> query -> handoff -> mcp`

The package runs from the repository with `npm run contextgraph -- <command>`.
It does not require a global npm installation, Docker, a remote service, or a
remote language model.

## Scope

- TypeScript CLI targeting Node.js 22 LTS.
- SQLite storage through `better-sqlite3`, including FTS5.
- Repository-local invocation through npm scripts.
- `init`, `index`, `status`, `query`, `handoff`, and `mcp` commands.
- Markdown, JSON, and plain-text source parsing.
- Stable blocks with content hashes and incremental source updates.
- Rule-based semantic node classification.
- Git HEAD and working-tree-aware freshness reporting.
- Secret-file exclusion and content redaction before database writes.
- MCP tools `get_context_status` and `get_relevant_context`.
- Automated tests and a user-facing README.

## Out Of Scope

- Watch mode.
- Cloud sync, team permissions, or remote storage.
- Remote LLM calls or automatic access to private agent memories.
- Embeddings or vector databases.
- Conflict detection or LLM-based semantic extraction.
- Web UI, graph visualization, editor extensions, or sidebars.
- Global npm installation or `npm link` as the primary workflow.

## Architecture

The implementation is split into focused modules:

1. **CLI layer** parses commands and formats human-readable output.
2. **Core services** implement initialization, indexing, status, querying, and
   handoff behavior independently of the CLI.
3. **Parsing and classification** convert supported source files into stable
   blocks and deterministic semantic nodes.
4. **Storage** owns SQLite schema creation, transactions, FTS synchronization,
   and persistence.
5. **Adapters** isolate filesystem scanning, Git inspection, and MCP transport.

Core services return structured values. CLI and MCP are separate consumers of
the same services and database, preventing command output concerns from leaking
into indexing and query behavior.

## Project Layout

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

Files should remain responsibility-focused. Shared domain types belong in
`src/types`; behavior should not be concentrated in one large CLI file.

## Initialization

`contextgraph init` finds the current project root and creates:

```text
.contextgraph/
  graph.db
  config.json
  status.json
  sessions/
  logs/
  snapshots/
```

It also creates or updates `AGENTS.md`. If the file exists, it appends one
idempotent, clearly delimited ContextGraph instruction section without
overwriting existing content. Re-running `init` must not duplicate the section.

The default configuration contains source globs, ignore globs, schema version,
project name, and an offline privacy policy. Sensitive files such as `.env`,
private keys, certificates, build output, dependencies, Git internals, and the
SQLite database are ignored by default.

## Storage Model

SQLite contains:

- `sources`: indexed files, file hashes, Git HEAD, timestamps, and metadata.
- `blocks`: stable source sections with line ranges and hashes.
- `nodes`: classified semantic knowledge linked to source and block.
- `edges`: typed graph relationships.
- `sessions`: recorded agent handoffs.
- `status`: persisted index and reliability values.
- `nodes_fts`: FTS5 index over node titles and content.

Foreign keys are enabled. Index updates run in transactions. Every node insert,
update, or delete synchronizes `nodes_fts` in the same transaction.

IDs are deterministic where possible:

- source ID derives from normalized project-relative path;
- block ID derives from source ID and stable block position;
- generated node ID derives from block ID, node type, and content hash.

## Parsing And Classification

Markdown is parsed as heading-based sections. Frontmatter is metadata rather
than section content. JSON is split into blocks by top-level key path. Plain
text is split into non-empty paragraphs.

Every block records source path, type, title, content, hash, and line range.
Unsupported or malformed files are reported as failed blocks without aborting
the entire indexing run.

Nodes use deterministic keyword rules and may have these MVP types:

`Rule`, `Workflow`, `Command`, `Test`, `Decision`, `Failure`, `Fix`,
`Environment`, `Preference`, `Note`, `AgentSession`, and `File`.

Classification precedence prevents broad matches from hiding specific ones:
commands and tests are identified before generic rules and notes. A block may
produce more than one node when it contains independently useful categories.
No LLM inference occurs.

## Incremental Indexing

`contextgraph index`:

1. Loads and validates `.contextgraph/config.json`.
2. Resolves configured source globs and applies ignore rules.
3. Rejects sensitive paths before reading content.
4. Calculates each source hash.
5. Skips unchanged sources.
6. Parses changed sources into blocks.
7. Reuses unchanged blocks by hash and replaces changed block nodes.
8. Removes records for deleted sources.
9. Updates FTS and aggregate status in one transaction.
10. Stores the current Git HEAD and working-tree snapshot.

The command prints scanned and changed source counts, block and node changes,
Git heads, indexing time, and resulting status.

## Trust Status

`contextgraph status` computes current state rather than trusting only the last
written JSON file. It compares:

- database availability and last index success;
- current and indexed Git HEAD;
- current source hashes against indexed source hashes;
- deleted or newly matched source files;
- failed block count.

Reliability rules:

- **High**: index exists, HEAD matches, source set and hashes match, and no
  failed blocks exist.
- **Medium**: HEAD and source content match, but non-fatal warnings or failed
  blocks exist.
- **Low**: database is missing, indexing failed, HEAD differs, or source
  content/source membership changed.

`Fresh` means reliability is High or Medium and indexed content matches the
current project. `Stale` means indexed content may differ. This ensures editing
`AGENTS.md` without committing still makes status stale.

Status is saved to both `.contextgraph/status.json` and the SQLite `status`
table after indexing. Runtime-only details such as MCP process state are shown
when known but do not affect content freshness.

## Query

`contextgraph query "<task>"` searches `nodes_fts`, ranks matches using FTS5,
and returns structured context with:

- node type;
- title;
- content excerpt;
- source path and line range;
- confidence;
- node status.

The output always includes graph freshness and reliability. Stale results remain
available but carry a prominent warning. Empty or syntax-hostile queries return
a useful validation message rather than raw SQLite errors.

## Handoff

`contextgraph handoff` accepts:

- `--agent`;
- `--task`;
- `--summary`;
- optional comma-separated `--files`.

It records a `sessions` row and an `AgentSession` node. Rule-based extraction
creates related `Failure`, `Fix`, `Test`, or `Note` nodes from the summary.
Edges connect the session to the current Git HEAD metadata, referenced files,
and produced nodes. Referenced paths are normalized and stored project-relative.

## MCP

`contextgraph mcp` starts a stdio MCP server using the same core services and
database as the CLI. Logging must never write to stdout because stdout carries
the MCP protocol.

The MVP exposes:

- `get_context_status`: returns structured freshness, reliability, timestamps,
  Git heads, and node count.
- `get_relevant_context`: accepts a task and optional file paths, then returns
  ranked relevant nodes with source evidence and status warnings.

The server performs no network calls and binds no TCP port.

## Security

ContextGraph is offline by default and contains no remote transport.

Security is enforced in two stages:

1. Path filtering excludes configured and built-in sensitive filenames and key
   material before files are read.
2. Content redaction replaces likely assignments for API keys, secrets, tokens,
   passwords, passphrases, and private-key blocks with `[REDACTED_SECRET]`
   before block hashes, nodes, logs, status details, or database records are
   written.

Error output must not echo unredacted source content. Config validation cannot
disable offline mode or enable remote LLM behavior in the MVP.

## Error Handling

- Commands fail with a non-zero exit code and concise remediation text.
- Commands other than `init` explain when initialization is required.
- Invalid configuration reports field-level validation errors.
- A malformed individual source is counted and reported while other sources
  continue indexing.
- Database migrations and index updates are transactional.
- MCP converts domain failures into protocol-safe tool errors.

## Testing

Tests use temporary Git repositories and temporary project directories so they
cannot alter this repository or other local projects.

Required coverage:

- `init` creates the local directory, config, database, status, and idempotent
  `AGENTS.md` instructions.
- Markdown is scanned and split by headings with correct line ranges.
- JSON and plain text produce stable blocks.
- Rules, commands, and tests are classified.
- Unchanged files are skipped and changed/deleted sources update correctly.
- Status detects fresh content, a changed Git HEAD, and uncommitted source
  changes.
- Query returns FTS results and warns when stale.
- Handoff creates a session, nodes, and relationships.
- Sensitive files are skipped and secret content is redacted.
- MCP starts over stdio and both required tools return valid structured data.

`npm test`, type checking, and a production build are completion gates.

## Documentation

The README opens with the required product statement:

> ContextGraph is a local-first context graph for coding agents.
> Markdown files are sources. Agent sessions are sources. Git history is a
> source. Test commands are sources. The graph is the interface. The status is
> the trust layer. MCP is the agent protocol.

It documents installation, repository-local command usage, the complete MVP
workflow, local-first security, MCP configuration, and current limitations.

## Delivery And Repository Constraints

- Work is developed directly in this repository and invoked through npm.
- No global npm packages are installed.
- Docker is not required for the MVP. If later introduced, it must use an
  isolated Compose project, names, volumes, networks, and ports.
- Repository-local Git identity is `StarDreamG
  <StarDreamG@users.noreply.github.com>`.
- Any future remote must use `github.com/StarDreamG`; GitLab remotes and
  credentials are prohibited for this repository.
- Non-trivial implementation begins from a normalized Issue. Until a GitHub
  remote and authenticated GitHub tooling exist, the approved specification is
  the local authoritative task description; the first GitHub Issue must mirror
  it before implementation is published.

## Acceptance Criteria

1. An empty project can run `init` successfully.
2. Indexing an `AGENTS.md` creates and populates `graph.db`.
3. Status reports freshness, reliability, last indexed time, current HEAD, and
   indexed HEAD.
4. Editing a configured source without re-indexing makes status stale.
5. Re-indexing restores fresh status.
6. Querying for test-related context returns relevant `Test`, `Rule`, or
   `Command` nodes with source evidence.
7. Handoff records a session and related graph nodes.
8. MCP starts over stdio and exposes both required tools.
9. Secrets are not persisted in clear text.
10. Tests, type checking, and build all pass.
11. README lets a new user complete the workflow without global installation.

## Risks And Mitigations

- **Native SQLite installation:** pin a Node 22-compatible `better-sqlite3`
  version and verify clean installation in CI.
- **Incorrect freshness:** calculate working-tree source hashes at status time,
  not only Git HEAD equality.
- **FTS query syntax errors:** sanitize or quote user terms and test punctuation
  and multilingual input.
- **Over-classification:** keep deterministic precedence and preserve source
  evidence so users can judge results.
- **Secret leakage:** filter before reading when possible and redact before every
  persistence boundary.
- **MCP protocol corruption:** reserve stdout for protocol messages and send
  diagnostics to stderr.
