# Changelog

All notable changes to ContextGraph will be documented in this file.

This project follows a simple early-stage changelog format. Version numbers match the npm package when published.

## [0.1.2] - 2026-06-29

### Added

- Public repository positioning for ContextGraph as local-first operational memory for coding agents.
- GitHub issue forms for bug reports, feature requests, and design changes.
- Pull request template with local-first safety checks.
- Contributing and security guidance.
- Repository metadata for npm and GitHub discoverability.

### Changed

- README now leads with product positioning, install, quick start, agent workflow, command overview, MCP, security model, current status, use cases, and roadmap.
- GitHub repository About description and topics now match the product positioning.

### Verified

- `npm run build`
- `npm run check`
- `npm test`
- `npm pack --dry-run`

## [0.1.1] - 2026-06-27

### Added

- Level 0 closed loop for local project context: `init`, `index`, `status`, `query`, `brief`, MCP, and `handoff`.
- SQLite-backed local storage, FTS retrieval, secret redaction, priority classification, freshness checks, and basic project experience edges.
