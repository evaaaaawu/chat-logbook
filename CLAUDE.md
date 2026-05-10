# CLAUDE.md

Local-first browser UI for AI assistant conversation history. Reads JSONL,
markdown, and SQLite that local CLI/IDE agents write under their own home
directories — Claude Code (`~/.claude/`) today; other agents
(`~/.codex/`, `~/.aider/`, OpenCode, etc.) planned via a parser-plugin
architecture (one plugin per agent). Monorepo: `api/` (Hono) +
`web/` (React + Vite).

For commands, stack, and how to run the project, see `README.md` and
`CONTRIBUTING.md`. For positioning, scope, and non-goals, see `docs/PRD.md`.

## Hard rules

- **Agent source directories are read-only. Never write, modify, or delete
  anything under them.** This covers `~/.claude/` today and every agent we
  add (`~/.codex/`, `~/.aider/`, etc.). They hold the user's live history;
  corrupting them is unrecoverable. Even features that "clean up old
  conversations" must operate on chat-logbook's own data store, not on the
  source directory.

- **Four separate stores. Do not merge them.**
  1. **Source directories** (e.g. `~/.claude/`) — read-only conversation
     data. Vendor-controlled. May be auto-cleaned by the vendor (Claude
     Code default 30 days, Codex CLI multiple retention windows).
  2. **`~/.chat-logbook/data.db`** — user-added metadata: custom titles,
     tags, annotations, highlights, soft-delete flags, message overrides
     (when edit feature is wired up). User-owned and backup-worthy. Keys
     against chat-logbook's internal session id, not the vendor's.
  3. **`~/.chat-logbook/archive.db`** — derived snapshot of conversations
     read from source. Two layers: `raw_messages` (verbatim per-agent JSON
     line, with `payload_hash` as content-based idempotency key) and
     `messages` (canonical normalized shape used by API, UI, and FTS).
     Backup-worthy: once vendors have cleaned up source, this is the only
     remaining copy. See archive contract below.
  4. **`~/.chat-logbook/index.db`** — derived FTS5 search index, sourced
     from `archive.db.messages.text`. Freely rebuildable; tokenizer or
     schema upgrades are `rm index.db` + restart. Never put user data
     here, and never put index tables in `data.db` or `archive.db`.

- **Archive contract.** `archive.db` is more sensitive than `index.db`
  because once source is gone, archive rows are the only copy. The rules:
  - **Never delete archive rows in response to source deletion.** Vendor
    auto-cleanup, file unlink, path collisions — none of these may
    cascade into archive deletion.
  - **Only an explicit user purge action may delete archive rows.** Soft
    delete (Trash) sets `data.db.sessions_meta.is_deleted` and does not
    touch archive. Hard delete (Purge) is the single exception, requires
    user confirmation, and writes an `ingestion_events('user_purged')`
    audit row that is itself never deleted.
  - **Schema migrations preserve `raw_payload` bytes.** The canonical
    layer (`messages`) is rebuildable from `raw_messages`; raw is not.
  - **`archive.db` is the canonical export format.** Any "export to X"
    feature builds on top of the public schema; it never replaces it.
    The schema is treated as a public format — forward-only migrations,
    additive when possible, no app-internal columns. Vendor-specific
    quirks live inside `raw_payload`.

- **Local-only product: no telemetry, no analytics, no third-party API
  calls.** Reject suggestions that would send any user data off-machine.
  Cloud sync is a separate, opt-in product (`chat-logbook-sync`), not a
  feature of this OSS core.

- **Visibility is enforced at the read API, not at storage.** `is_deleted`,
  trash, and any future visibility flag live in `data.db.sessions_meta`
  and are applied as a JOIN at query time. `archive.db`, `index.db`, and
  ingestion code stay unaware of them. This keeps storage simple and
  guarantees one place can never disagree with another.
