# Requirement Management Process

## Purpose
This process prevents product background, specific requirements, implementation status, and code changes from being mixed together.

## Where Things Belong

| Information Type | Location |
|---|---|
| Product vision | docs/product/00-vision.md |
| Overall PRD | docs/product/01-prd.md |
| Design principles | docs/product/02-design-principles.md |
| Terms | docs/product/03-glossary.md |
| Agent workflow | docs/product/04-agent-workflow.md |
| Concrete requirements | GitHub Issues |
| Task status | GitHub Projects |
| Implementation | Pull Requests |
| Code history | Git commits |

## Issue Lifecycle
Backlog → Ready → In Progress → Review → Done

## Ready Definition
An Issue is Ready only when it has:
- Background
- User story or problem statement
- Scope
- Out of scope
- Acceptance criteria
- Priority
- Target version or milestone if applicable

## Done Definition
An Issue is Done only when:
- Code is merged
- Acceptance criteria are met
- Tests or manual verification are documented
- PR is linked
- Follow-up work is captured separately
