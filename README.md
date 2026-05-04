# chat-logbook

> _Where your AI conversations live._

chat-logbook is a local-first library for your AI conversations. It reads the
files AI assistants write on your machine — starting with Claude Code, with
more tools planned — and presents them as a single browsable, searchable,
organizable history.

> **Status:** Early release (v0.2.1). Browsing and rendering work well today.
> Search, tags, and annotations are on the way. See [Roadmap](#roadmap).

## About

You open chat-logbook from the command line, and a browser window opens onto
your conversation history. You can browse it, find anything in it, tag what
matters, and pick up where you left off.

Nothing leaves your machine. There is no account to create. The original
files written by your AI tools are never modified.

Design principles:

- **Read-only access to source directories.** Original conversation files are
  never modified. Today that means `~/.claude/`; the same rule applies to
  every agent we add.
- **Local-only.** No telemetry, no analytics, no third-party calls.
- **Zero configuration.** Install and run.
- **Drive everything from the keyboard.** A `/` or `⌘K` overlay finds any
  past conversation in seconds. The mouse still works, but every primary
  action has a binding.

The full problem statement, user stories, and direction live in the
[PRD](docs/PRD.md).

## What works today

- **Three-column layout** — Resizable panels for filters, session list, and conversation content
- **Rich conversation rendering** — Markdown, syntax-highlighted code blocks, collapsible tool calls with one-line summaries, and collapsible thinking blocks
- **Virtual scrolling** — Handles long conversations smoothly with virtualized rendering
- **Solarized Dark theme** — Easy on the eyes, consistent with Claude Code's terminal aesthetic

## Quick start

Requirements: Node.js 20+.

Install globally for a shorter command:

```bash
npm install -g chat-logbook
chat-log
```

Or try without installing:

```bash
npx chat-logbook@latest
```

You should see:

```
chat-logbook is running at http://localhost:3100
```

Your browser will open automatically, showing a list of your Claude Code sessions on the left and conversation content on the right.

### Troubleshooting

**"No conversations found"**
Make sure you have Claude Code conversation history at `~/.claude/`. chat-logbook reads from this directory automatically.

**Port already in use**
By default, chat-logbook runs on port 3100. Use `PORT=8080 chat-log` to specify a different port.

**Updating to the latest version**
Run `npm install -g chat-logbook@latest` to update. If you use npx, the `@latest` tag ensures you always run the newest version.

## Architecture

Monorepo with two workspaces, published as a single npm package:

| Directory | Role                                                                      | Stack                                   |
| --------- | ------------------------------------------------------------------------- | --------------------------------------- |
| `api/`    | Backend — reads `~/.claude/` JSONL files, serves session and message data | Hono + @hono/node-server                |
| `web/`    | Frontend — three-column SPA with conversation rendering                   | React + Vite + Tailwind CSS + shadcn/ui |

In production, Hono serves both the API endpoints and the static frontend
assets from a single Node.js process. During development, Vite proxies `/api`
requests to the Hono dev server.

### How it reads conversations

chat-logbook reads conversation data directly from the JSONL files that Claude
Code stores in `~/.claude/`. It **never modifies** these files — your original
conversation data is always left untouched.

Only conversations that are written to `~/.claude/` are visible. Ephemeral
interactions that Claude Code does not persist (such as `/btw` side questions)
cannot be displayed.

## Development

Requirements: Node.js 20+ and pnpm 10+.

```bash
git clone https://github.com/evaaaaawu/chat-logbook.git
cd chat-logbook
pnpm install
pnpm dev
```

### Scripts

| Command          | What it does                                        |
| ---------------- | --------------------------------------------------- |
| `pnpm dev`       | Start dev servers for both workspaces (Vite + Hono) |
| `pnpm build`     | Build frontend and backend for production           |
| `pnpm test`      | Run all tests (Vitest)                              |
| `pnpm typecheck` | Type-check all workspaces                           |

A Husky `pre-commit` hook runs Prettier on staged files, type-checks, and runs
the test suite on every commit.

## FAQ

### Does chat-logbook work with Claude Code on the web?

No. chat-logbook reads from local `~/.claude/` files, which are only created by the Claude Code CLI running on your machine. Conversations run via Claude Code on the web (cloud VMs) are not stored locally and are not accessible to chat-logbook.

### Why can't I see my `/btw` conversations?

`/btw` is designed to be ephemeral — questions and answers appear in a temporary overlay and are never written to conversation history files. If you want a conversation to be preserved and visible in chat-logbook, use a regular message instead of `/btw`.

## Roadmap

The headline feature on the way is **Spotlight Search** — a `⌘K` / `/` overlay
that searches across sessions, messages, tags, and projects with full keyboard
navigation, full-text matching (SQLite FTS5 trigram), and message-level jump +
highlight. It is tracked as the [Spotlight Search epic (#5)](https://github.com/evaaaaawu/chat-logbook/issues/5).

Work is grouped into release milestones:

### [v0.3.0 — Spotlight Alpha](https://github.com/evaaaaawu/chat-logbook/milestone/1)

- **Spotlight overlay skeleton** — `⌘K` / `/` opens an overlay; sessions picker; `Enter` opens, `Esc` closes
- **SQLite + soft delete & restore** — hide sessions you don't need; recover them anytime
- **Full keyboard contract** — Browse + Spotlight bindings unified

### [v0.4.0 — Spotlight v1](https://github.com/evaaaaawu/chat-logbook/milestone/2)

- **FTS5 full-text messages search** — fast keyword search across all conversations, including CJK and file paths mentioned in tool calls
- **Incremental reindex** — newly-arrived messages are searchable within seconds
- **Message-level jump** — Spotlight matches scroll to the exact message and highlight the matched term, with a `n / m matches  ↑↓ Esc` navigator bar
- **Tags & Projects pickers** — `Tab`-cycle picker scopes; tag/project selection applies the same filter pipeline as the navigation panel
- **Tag system + tag filtering** — color-coded tags, multi-tag AND filtering
- **Project filtering** — focus on conversations within a specific project
- **Title editing** — customize session titles for easier identification

### [v0.5.0 — Cross-vendor foundation](https://github.com/evaaaaawu/chat-logbook/milestones)

- **Parser plugin architecture** — one plugin per agent, behind a stable
  interface, so adding a new tool is a contained change
- **First additional agents** — Codex CLI and Aider plugins, alongside the
  existing Claude Code reader
- **`SyncProvider` interface stub** — a no-op default in the OSS core, leaving
  the integration point open for an opt-in cloud product later

### Later

- **Real-time streaming** — watch active conversations update live via SSE
- **Annotations** — add notes next to any message in a conversation
- **Highlights** — mark important text within conversations
- **`#tag` / `@project` prefix syntax** in Spotlight (fast-follow)
- **Recent-sessions empty state + onboarding hint** in Spotlight (fast-follow)

Explicit non-goals: semantic / vector search, cloud sync inside the OSS core,
and any modification of source directories like `~/.claude/`. See the
[PRD](docs/PRD.md) for the full out-of-scope list.

This project is **not affiliated with Anthropic, OpenAI, or any other AI
provider.** It reads files those tools write on your machine; it does not
talk to their servers and is not endorsed by them.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

You are free to use, modify, and distribute this software under the terms of the AGPL-3.0. If you modify the program and make it available over a network, you must release your modified source code under the same license.

For commercial licensing inquiries, please contact the author.
