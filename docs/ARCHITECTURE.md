# Architecture

> Before changing storage layout or ingestion, also check `docs/PRD.md` § Out of Scope. Some "obvious" features (cloud sync inside the OSS core, modification of source directories, bulk export to bespoke formats) are deliberate non-goals and shouldn't drive architecture decisions.

## Current state

Today the codebase implements three stores under `~/.chat-logbook/`:

- `metadata.db` — user-added metadata (titles, tags, soft-delete flags).
  Code lives in `api/src/metadata/`.
- `archive.db` — derived snapshot of conversations read from source.
  Code lives in `api/src/archive/`.
- `checkpoint.db` — per-Source-file scan watermark.
  Code lives in `api/src/checkpoint/`.

`index.db` described below is planned, not yet implemented. Source directories under `~/.claude/` are read directly while the app is running.

## Five stores (target architecture)

The product is designed around five separate stores. Do not merge them.

All four chat-logbook stores live under one data directory, `~/.chat-logbook` by default. Set `CHAT_LOGBOOK_DATA_DIR` to relocate the entire directory — one knob for all stores, resolved once at startup by `resolveDataDir` (`api/src/config/data-dir.ts`). Unset means the default, so existing installs are unaffected; a relative value is resolved against the current working directory. This is how development, tests, and seeded datasets each point at an isolated directory without touching the real `~/.chat-logbook` (Twelve-Factor Config). The Source directory below is separate and never moves with this setting.

| Store      | Path                            | Backed up?            |
| ---------- | ------------------------------- | --------------------- |
| Source     | `~/.claude/`, `~/.codex/`, etc. | Out of our hands      |
| Data       | `~/.chat-logbook/metadata.db`   | Yes — back this up    |
| Archive    | `~/.chat-logbook/archive.db`    | Yes — back this up    |
| Checkpoint | `~/.chat-logbook/checkpoint.db` | No — rebuilt by Scan  |
| Index      | `~/.chat-logbook/index.db`      | No — `rm` and rebuild |

1. **Source directories** (`~/.claude/`, `~/.codex/`, etc.) — read-only conversation data. Vendor-controlled. May be auto-cleaned by the vendor (Claude Code defaults to 30 days; Codex CLI has multiple retention windows).

2. **`~/.chat-logbook/metadata.db`** — user-added metadata: custom titles, tags, annotations, highlights, soft-delete flags, message overrides (when the edit feature is wired up). User-owned and backup-worthy. Keys against chat-logbook's internal chat `id` (UUID), not the vendor's.

3. **`~/.chat-logbook/archive.db`** — derived snapshot of conversations
   read from source. Two layers:
   - `raw_messages` — verbatim per-agent JSON line, with `payload_hash`
     as content-based idempotency key.
   - `messages` — normalized shape used by API, UI, and FTS.

   Backup-worthy: once vendors have cleaned up source, this is the only
   remaining copy. See the archive contract below.

4. **`~/.chat-logbook/checkpoint.db`** — derived scan watermark (`chat_scan_state`: per-Source-file last mtime, size, and scan time) that lets a Scan skip unchanged files. Derived from Source and rebuildable: a full re-scan repopulates it, so it is never backed up. Kept out of `archive.db` (the public export format) and `index.db` (whose rebuild lifecycle is independent) — see ADR-0014.

5. **`~/.chat-logbook/index.db`** — derived FTS5 search index, sourced from `archive.db.messages.text`. Freely rebuildable; tokenizer or schema upgrades are `rm index.db` + restart. Never put user data here, and never put index tables in `metadata.db` or `archive.db`.

## Plugin per agent

Source format is polymorphic — Claude Code uses per-session JSONL, Codex CLI uses rollout JSONL plus a state DB, Aider uses a single markdown file, OpenCode uses an internal SQLite. The design is one plugin per agent, each conforming to a narrow three-method interface:

```ts
export interface AgentPlugin {
  id: string; // 'claude-code', 'codex', 'aider', 'opencode'
  displayName: string;
  discover(env: PluginEnv): AsyncIterable<ChatRef>;
  extractRaw(ref: ChatRef): AsyncIterable<RawRecord>;
  normalize(raw: RawRecord): NormalizedMessage | null;
}
```

Plugins will live under a `plugins/` directory in `api/src/`, with a registry the ingestion pipeline reads. Adding a new agent is a contained change — implement the interface, register it. The ingestion pipeline never needs agent-specific code.

## Ingestion

Two complementary modes, both inside the same Node.js process:

- **On-app-open scan.** When `chat-log` starts, walk every source root per registered plugin and ingest only new content (mtime fast path, content-based idempotency).
- **File watcher (chokidar).** While the app runs, watch source paths. `add` and `change` trigger incremental ingest. `unlink` records an audit row and never deletes archive rows (see Archive contract).

Idempotency key: `(agent, source_id, payload_hash)`. Re-runs are no-ops. Source-side edits, truncations, or path collisions append new raw rows; the normalized layer applies last-write-wins by `ts`.

## Reading model

API routes read from `archive.db.messages` (joined with `archive.db.chats` for chat-logbook's internal chat `id`), not from source files. Parsing happens at ingestion time, not at serve time — meaning parser bugs are fixed by re-ingesting affected rows, not by changing the read path.

### Two ids per chat

- `chats.id` — internal UUID, primary key, never exposed to users. Used as the join key from `metadata.db.chats_meta` and as the stable identity across vendor source-id collisions.
- `chats.chat_id` — short, user-facing identifier (Crockford base-32, 6 chars). What we'd surface in URLs and short references. Formerly named `short_code`.

## Archive contract

`archive.db` is more sensitive than `index.db` because once source is
gone, archive rows are the only copy.

- **Never delete archive rows in response to source deletion.** Vendor auto-cleanup, file unlink, path collisions — none of these may cascade into archive deletion.
- **Only an explicit user purge action may delete archive rows.** Soft delete (Trash) sets `metadata.db.chats_meta.is_deleted` and does not touch archive. Hard delete (Purge) is the single exception, requires user confirmation, and writes an `ingestion_events('user_purged')` audit row that is itself never deleted.
- **Schema migrations preserve `raw_payload` bytes.** The normalized layer (`messages`) is rebuildable from `raw_messages`; raw is not.
- **`archive.db` is the canonical export format.** Any "export to X" feature builds on top of the public schema; it never replaces it. The schema is treated as a public format — forward-only migrations, additive when possible, no app-internal columns. Vendor-specific quirks live inside `raw_payload`.

  **One-time rename in v0.8.0:** the `session → chat` rename (`sessions` table → `chats`, plus column renames `short_code → chat_id`, `source_session_id → source_id`, `session_id → source_id` on child tables) is a deliberate one-time exception to the "additive only" rule. The product supports multiple agents whose per-conversation unit isn't called a "session" — picking the right noun before 1.0 is worth the break. Future schema changes should remain additive.

## Visibility model

Visibility is enforced at the read API, not at storage. `is_deleted`, trash, and any future visibility flag live in `metadata.db.chats_meta` and are applied as a JOIN at query time. `archive.db`, `index.db`, and ingestion code stay unaware of them. This keeps storage simple and guarantees one place can never disagree with another.
