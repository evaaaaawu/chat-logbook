# CLAUDE.md

Local-first browser UI for Claude Code conversation history. Reads JSONL files Claude Code writes to `~/.claude/`. Monorepo: `api/` (Hono) + `web/` (React + Vite).

For commands, stack, architecture, and project structure, see `README.md`.

## Hard rules

- **`~/.claude/` is read-only. Never write, modify, or delete anything under it.** That directory is the user's live Claude Code history; corrupting it is unrecoverable. Even features that "clean up old conversations" must operate on the separate user data store, not on `~/.claude/`.
- **All user-added metadata (custom titles, tags, annotations, highlights) lives in a separate SQLite DB at `~/.chat-logbook/data.db`, linked back to `~/.claude/` records by session ID.** Do not propose merging the two stores or writing user data back to `~/.claude/` — the separation is the whole point.
- **Local-only product: no telemetry, no analytics, no third-party API calls.** Reject suggestions that would send any user data off-machine.
