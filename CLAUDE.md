# CLAUDE.md

Local-first browser UI for AI assistant conversation history. Reads JSONL files
that local CLI/IDE agents write under their own home directories — Claude Code
(`~/.claude/`) today; other agents (e.g. `~/.codex/`, `~/.aider/`) planned via
a parser-plugin architecture (one plugin per agent). Monorepo: `api/` (Hono) +
`web/` (React + Vite).

For commands, stack, architecture, and project structure, see `README.md`. For
positioning, scope, and non-goals, see `docs/PRD.md`.

## Hard rules

- **Agent source directories are read-only. Never write, modify, or delete
  anything under them.** This covers `~/.claude/` today and every agent we
  add (`~/.codex/`, `~/.aider/`, etc.). They hold the user's live history;
  corrupting them is unrecoverable. Even features that "clean up old
  conversations" must operate on chat-logbook's own data store, not on the
  source directory.
- **Three separate stores. Do not merge them.**
  1. Source directories (e.g. `~/.claude/`) — read-only conversation data.
  2. `~/.chat-logbook/data.db` — user-added metadata (custom titles, tags,
     annotations, highlights, soft-delete flags), linked back to source
     records by session ID. This is user-owned and backup-worthy.
  3. `~/.chat-logbook/index.db` — derived FTS5 search index. Freely
     rebuildable; tokenizer or schema upgrades are `rm index.db` + restart.
     Never put user data in here, and never put index tables in `data.db`.
- **Local-only product: no telemetry, no analytics, no third-party API calls.**
  Reject suggestions that would send any user data off-machine. Cloud sync is
  a separate, opt-in product (`chat-logbook-sync`), not a feature of this OSS
  core.
