# Contributing

ContextGraph is an early local-first developer tool for coding agents.

The most useful contributions right now are:

- bug reports
- query miss cases
- MCP integration issues
- documentation improvements
- local-first safety reviews

Before opening a pull request, run:

```bash
npm run build
npm run check
npm test
```

Please keep changes small and traceable to an Issue when they affect behavior.

ContextGraph does not accept changes that add default network upload, default remote LLM calls, or default project-data export. Any provider integration must be explicit opt-in and must preserve the local-first baseline.
