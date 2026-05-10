# Contributing to chat-logbook

Thanks for considering it. This document covers what you need to run the
project locally, how the code is laid out, and what the architecture is
designed to do.

For positioning, scope, and non-goals, read [docs/PRD.md](docs/PRD.md)
first — it's the same document the maintainer works from.

## Stack

| Layer           | Choice                                                          |
| --------------- | --------------------------------------------------------------- |
| Backend         | [Hono](https://hono.dev) on `@hono/node-server`                 |
| Frontend        | React + Vite + Tailwind CSS + shadcn/ui (Radix UI)              |
| Database        | [Drizzle ORM](https://orm.drizzle.team) + better-sqlite3 (FTS5) |
| File watcher    | chokidar                                                        |
| Real-time       | Server-Sent Events                                              |
| Test            | Vitest + React Testing Library + MSW                            |
| Package manager | pnpm 10+                                                        |
| Distribution    | npm package, CLI command `chat-log`                             |

## Repo layout

Monorepo, two workspaces, shipped as one npm package:

| Directory | Role                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- |
| `api/`    | Backend. Reads source directories, ingests into `archive.db`, serves session and message data. |
| `web/`    | Frontend. Three-column SPA with conversation rendering and Spotlight.                          |

In production, Hono serves both the API endpoints and the static frontend
assets from a single Node.js process. During development, Vite proxies
`/api` requests to the Hono dev server.

## Local development

Requirements: Node.js 20+ and pnpm 10+.

```bash
git clone https://github.com/evaaaaawu/chat-logbook.git
cd chat-logbook
pnpm install
pnpm dev
```

`pnpm dev` starts both workspaces (Vite for `web/`, tsx for `api/`).
The dev URL prints on startup.

### Scripts

| Command          | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `pnpm dev`       | Start dev servers for both workspaces (Vite + Hono). |
| `pnpm build`     | Build frontend and backend for production.           |
| `pnpm test`      | Run all tests (Vitest).                              |
| `pnpm typecheck` | Type-check all workspaces.                           |

A Husky `pre-commit` hook runs Prettier on staged files, type-checks,
and runs the test suite on every commit.

## Architecture

The current data architecture is a **four-store separation**, each store
with a distinct contract that prevents the others' concerns from leaking
into it. The full rationale is in [docs/PRD.md](docs/PRD.md); this
section is the working summary contributors need.

### The four stores

| Store   | Path                                         | Role                                                                                                                         | Backed up?            |
| ------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Source  | `~/.claude/`, `~/.codex/`, `~/.aider/`, etc. | Read-only conversation data written by AI tools. May be auto-cleaned by the vendor.                                          | Out of our hands      |
| Archive | `~/.chat-logbook/archive.db`                 | chat-logbook's own copy of every conversation it has read. Two layers: `raw_messages` (verbatim) and `messages` (canonical). | Yes — back this up    |
| Data    | `~/.chat-logbook/data.db`                    | User-added metadata: titles, tags, annotations, soft-delete flags, message overrides.                                        | Yes — back this up    |
| Index   | `~/.chat-logbook/index.db`                   | FTS5 search index sourced from `archive.db.messages.text`.                                                                   | No — `rm` and rebuild |

The hard rules that hold the architecture together live in
[CLAUDE.md](CLAUDE.md). Read those before changing how the stores
interact.

### Plugin per agent

Source format is polymorphic — Claude Code uses per-session JSONL,
Codex CLI uses rollout JSONL plus a state DB, Aider uses a single
markdown file, OpenCode uses an internal SQLite. One plugin per agent,
each conforming to a narrow three-method interface:

```ts
export interface AgentPlugin {
  id: string; // 'claude-code', 'codex', 'aider', 'opencode'
  displayName: string;
  discover(env: PluginEnv): AsyncIterable<SessionRef>;
  extractRaw(ref: SessionRef): AsyncIterable<RawRecord>;
  normalize(raw: RawRecord): CanonicalMessage | null;
}
```

Plugins live under `api/src/plugins/<agent-id>/`. Adding a new agent is
a contained change — implement the interface, register in
`api/src/plugins/registry.ts`. The ingestion pipeline never needs
agent-specific code.

### Ingestion

Two complementary modes, both inside the same Node.js process:

- **On-app-open scan.** When `chat-log` starts, walk every source root
  per registered plugin and ingest only new content (mtime fast path,
  content-based idempotency).
- **File-watcher (chokidar).** While the app runs, watch source paths.
  `add` and `change` trigger incremental ingest. `unlink` records an
  audit row and never deletes archive rows.

Idempotency key: `(agent, session_id, payload_hash)`. Re-runs are
no-ops. Source-side edits, truncations, or path collisions append new
raw rows; the canonical layer applies last-write-wins by `ts`.

### Reading and visibility

API routes read from `archive.db.messages` (joined with
`archive.db.sessions` for chat-logbook ID), not from source files.
`parser.ts` runs at ingestion time, not at serve time.

Visibility (`is_deleted`, future flags) lives in
`data.db.sessions_meta` and is applied at read time via a
`withVisibilityFilter` helper. Storage layer never knows about
visibility — this prevents the bug where session list and search
disagree.

## Conventions

### Branch naming

Match the patterns in `.claude/skills/git-workflow` (referenced from
`~/.claude/skills/git-workflow/SKILL.md`): `type/kebab-description`.
Examples: `feat/archive-db-skeleton`, `fix/parser-cjk-tokenize`.

### Commits

Conventional Commits style: `feat: …`, `fix: …`, `docs: …`,
`chore: …`. Keep the subject under 72 characters; explain the why in
the body when the why isn't obvious.

### Pull requests

- Branch from `main`.
- Keep PRs small. One vertical slice per PR — schema + API + UI +
  tests, in the same change.
- Describe what changed, why, and how to verify. A "Test plan"
  checklist helps.
- A CLA is required for external contributions. Details will appear
  on the PR template once the CLA tooling is in place.

### Code style

- TypeScript strict; no `any` unless explicitly justified.
- Prefer interfaces over type aliases for object shapes.
- File size: 200–400 lines typical, 800 hard ceiling. Split by
  feature / domain, not by type.
- Immutability: create new objects rather than mutate existing ones.
- Tests describe external behavior, not implementation details.

## License and CLA

This project is licensed under
[AGPL-3.0-only](LICENSE). Contributions are accepted under the same
license. A Contributor License Agreement preserves the project's
ability to relicense if necessary, while ensuring contributions remain
available to everyone.

## Where to ask

- For bugs and feature requests:
  [GitHub Issues](https://github.com/evaaaaawu/chat-logbook/issues).
- For longer questions and design discussions:
  [GitHub Discussions](https://github.com/evaaaaawu/chat-logbook/discussions).
