# chat-logbook

A local-first conversation browser for Claude Code.

> **Status:** Early release (v0.2.1). Core browsing and rendering work well.
> Search, filtering, tagging, and annotations are on the roadmap but not yet
> implemented. See [Roadmap](#roadmap) for what's planned.

## About

Claude Code stores every conversation as JSONL files in `~/.claude/`, but
provides no UI to browse or revisit them. chat-logbook fills that gap — it
reads those files and presents them in a browser, so you can review past
sessions without digging through raw JSON.

Design principles:

- **Read-only access to `~/.claude/`** — never modify original conversation files.
- **Local-only** — no data leaves your machine.
- **Zero configuration** — install and run, nothing else required.

The full problem statement, user stories, and implementation decisions live in
the PRD: [issue #1](https://github.com/evaaaaawu/chat-logbook/issues/1).

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

- **Full-text search** — Find conversations by keywords across all projects
- **Project filtering** — Focus on conversations within a specific project
- **Real-time streaming** — Watch active conversations update live via SSE
- **Keyboard shortcuts** — `↑↓` to switch sessions, `/` to search, `Esc` to go back
- **Soft delete & restore** — Hide sessions you don't need; restore them anytime
- **Title editing** — Customize session titles for easier identification
- **Tag system** — Add color-coded tags to sessions, filter by multiple tags
- **Annotations** — Add notes next to any message in a conversation
- **Highlights** — Mark important text within conversations

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

You are free to use, modify, and distribute this software under the terms of the AGPL-3.0. If you modify the program and make it available over a network, you must release your modified source code under the same license.

For commercial licensing inquiries, please contact the author.
