# ContextGraph TODO

This file tracks executable follow-up work that is not yet ready for core implementation in the current slice.

## P0: Knowledge Governance Planning

- [ ] Keep ContextGraph read-only by default.
- [ ] Add planned `knowledgePolicy` config:
  - `mode: read-only`
  - `sourceOfTruth: []`
  - `writableTargets: []`
- [ ] Document that ContextGraph may write `.contextgraph/graph.db`, `.contextgraph/status.json`, and internal caches.
- [ ] Document that ContextGraph must not silently modify README, AGENTS.md, or docs.
- [ ] Use safe diagnostic names:
  - Knowledge Hygiene
  - Documentation Debt
  - Source-of-Truth Warnings
  - Candidate Memory Review
- [ ] Avoid unsafe diagnostic names:
  - Write Suggestions
  - Auto Documentation Fix
- [ ] Ensure MCP guidance defaults to `agentActionAllowed=false` and `requiresHumanApproval=true`.

## P1: Handoff Reliability And Visibility

- [ ] Make handoff append-only.
- [ ] Replace second-level session ids with `timestamp-ms + agent-slug + short-random-id`.
- [ ] Add `contextgraph handoff latest`.
- [ ] Add `contextgraph handoff list`.
- [ ] Add `contextgraph handoff show <sessionId>`.
- [ ] Add `contextgraph handoff search "<query>"`.
- [ ] Make `brief` include only the latest handoff by default.
- [ ] Show historical handoff count in `brief` without injecting history by default.
- [ ] Add historical handoff freshness labels:
  - current
  - recent
  - stale
  - historical
  - possibly_outdated
  - superseded
- [ ] Mark MCP historical handoff responses with age, low trust for current state, and usage warning.
- [ ] Keep `AgentSession` confirmed, but mark handoff-derived Rule / Failure / Fix / Decision / EnvironmentFact as candidate or session-derived.
- [ ] Add handoff metadata:
  - source: handoff
  - sessionId
  - requiresHumanReview: true
- [ ] Add future handoff fields:
  - assumptions
  - risks
  - testsRun
  - testsPassed
  - knownIssues
  - nextSteps
  - basedOnSessionId
- [ ] Plan context evolution tools:
  - `contextgraph handoff timeline`
  - `contextgraph handoff timeline --file <path>`
  - `contextgraph handoff trace --file <path>`
  - `contextgraph handoff trace --query "<query>"`

## P2: Watcher / Daemon / Stale Reminder

- [ ] Keep `contextgraph watch` as foreground debug mode.
- [ ] Add `contextgraph daemon start`.
- [ ] Add `contextgraph daemon stop`.
- [ ] Add `contextgraph daemon restart`.
- [ ] Add `contextgraph daemon status`.
- [ ] Add `contextgraph daemon logs`.
- [ ] Do not auto-start daemon after global npm install.
- [ ] Let `contextgraph init` ask whether to enable background indexing without silently enabling it.
- [ ] Add status Indexer panel:
  - Mode
  - State
  - PID
  - Last event
  - Last indexed
  - Pending changes
  - Freshness
- [ ] Show stale reminder when sources changed and daemon is not running.

## P3: Knowledge Hygiene Diagnostics

- [ ] Add read-only status diagnostics for handoff-only high-priority facts.
- [ ] Add stale source warnings.
- [ ] Add possible conflict count.
- [ ] Add fragmented topic cluster count.
- [ ] Add candidate memory count.
- [ ] Ensure status does not recommend concrete target files unless `sourceOfTruth` and `writableTargets` are configured.
- [ ] Use human-review language, not automatic-write language.

## P4: Candidate Memory / Patch Proposal

- [ ] Add `contextgraph note add`.
- [ ] Add `contextgraph note list`.
- [ ] Add `contextgraph note approve`.
- [ ] Add `contextgraph note reject`.
- [ ] Add `contextgraph note export`.
- [ ] Store candidate memory in `.contextgraph/inbox/` by default.
- [ ] Support explicit `docs/contextgraph-candidates.md` as a configured candidate target.
- [ ] Mark candidate memory with:
  - status: candidate
  - requiresHumanReview: true
  - source: agent
  - confidence: low | medium | high
- [ ] Support state flow:
  - candidate
  - human_reviewed
  - confirmed
  - deprecated
  - superseded

## Test Requirements

- [ ] handoff append-only
- [ ] handoff id uniqueness
- [ ] handoff latest / list / show
- [ ] brief only includes latest handoff
- [ ] historical handoff marked as historical / stale / possibly_outdated
- [ ] MCP historical handoff includes usage warning
- [ ] status Knowledge Hygiene does not include direct write instruction by default
- [ ] default knowledgePolicy is read-only
- [ ] no command silently modifies README / AGENTS.md / docs
- [ ] daemon start writes pid/state/log
- [ ] daemon stop marks state disabled
- [ ] source changes without indexing show stale reminder

## Explicit Non-Goals For This Planning Slice

- [ ] Do not implement automatic AGENTS.md writes.
- [ ] Do not let status recommend concrete write target files unless `writableTargets` is configured.
- [ ] Do not let MCP `agentActionAllowed` default to true.
- [ ] Do not mark handoff-derived facts confirmed by default.
- [ ] Do not inject all historical handoff records into brief by default.
- [ ] Do not auto-start daemon after npm install.
- [ ] Do not introduce remote LLM calls or project data upload.
