# CLAUDE.md

This is a local-first browser UI for AI assistant conversation history.

This project uses pnpm.

## Hard rules

- Source directories (`~/.claude/`, `~/.codex/`, etc.) are read-only. Never write, modify, or delete anything under them.
- Never cascade-delete `archive.db` rows in response to source changes.
  Only an explicit user purge action deletes archive rows.
- Local-only: no telemetry, no analytics, no third-party API calls.

Before changing anything that touches SQLite schemas, archive ingestion, or FTS indexing — including any `*.db` files or storage layer code — read `docs/ARCHITECTURE.md` first.
