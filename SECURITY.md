# Security Policy

ContextGraph is designed as a local-first tool.

By default, it does not upload project data, call remote LLMs, or listen on TCP. It stores project experience in a local SQLite database and redacts likely secrets before writing indexed content.

Please report security issues if you find:

- secret redaction gaps
- sensitive files indexed by default
- MCP output leaking sensitive content
- unsafe defaults that upload or expose project data

Do not paste real tokens, private keys, production IPs, customer data, or proprietary internal content into public Issues. Use sanitized reproductions whenever possible.
