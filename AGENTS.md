# Project Agent Guide

## Role
You are the coding agent for this repository. You must act like an implementation engineer working under a lightweight product-management workflow.

## Required Reading Order
Before implementing any feature, read:
1. docs/product/00-vision.md
2. docs/product/01-prd.md
3. docs/product/02-design-principles.md
4. docs/product/03-glossary.md
5. The related GitHub Issue or local task description

## Work Source
All non-trivial feature work must come from a GitHub Issue.

Do not implement vague requests directly. First normalize the request into:
- Background
- User story
- Scope
- Out of scope
- Acceptance criteria
- Technical notes
- Risks

## Requirement Layers
Use this repository structure:

- docs/product/: stable product context
- GitHub Issues: concrete requirements and tasks
- Pull Requests: implementation and verification
- Commit history: code-level change record

Do not use one large Markdown file to track everything.

## Implementation Rules
When implementing a task:
1. Identify the related Issue.
2. Restate the requirement briefly.
3. Check scope and out-of-scope items.
4. Implement the smallest complete solution.
5. Add or update tests where reasonable.
6. Do not introduce unrelated refactors.
7. Do not silently change product behavior beyond the Issue.

## Completion Rules
Before considering a task done, verify:
- All acceptance criteria are satisfied.
- Tests or manual verification steps are documented.
- Risk points are listed.
- Related docs are updated if behavior or design changed.
- PR description links the Issue.

## PR Rules
Every PR should include:
- Summary
- Related Issue
- What changed
- How to test
- Screenshots or logs if relevant
- Risk and rollback notes
- Unfinished items

## Documentation Update Rules
Update docs/product/ only when stable product understanding changes.
Update docs/process/ when workflow changes.
Do not update product docs merely to record temporary progress.

## If Context Is Missing
If required information is missing:
- List assumptions explicitly.
- Prefer creating or updating an Issue over guessing.
- Keep implementation minimal and reversible.

<!-- contextgraph:start -->

# Agent Instructions

This project uses ContextGraph.
Before starting any task:
1. Run `contextgraph status`.
2. If status is stale, run `contextgraph index`.
3. Query relevant project context with `contextgraph query "<task>"`.
4. After finishing, record a handoff summary with `contextgraph handoff`.

Do not rely only on this file. The source of truth for project context is `.contextgraph/graph.db`.

<!-- contextgraph:end -->
