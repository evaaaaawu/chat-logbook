# chat-logbook

A local-first conversation manager for Claude Code.

Browse, tag, annotate, and organize your Claude Code conversation history — all from your browser.

## Features

- **Conversation browser** — Three-column interface (filters | session list | conversation content) for navigating all your Claude Code sessions
- **Full-text search** — Find conversations by keywords across all projects
- **Project filtering** — Focus on conversations within a specific project, or view everything at once
- **Real-time streaming** — Watch active Claude Code conversations update live in your browser via SSE
- **Collapsible tool calls** — Tool calls are collapsed by default with a one-line summary (e.g., "Read: src/index.ts")
- **Collapsible thinking blocks** — Thinking blocks are collapsed by default, expandable when you want to inspect Claude's reasoning
- **Soft delete & restore** — Hide sessions you don't need; restore them anytime
- **Keyboard shortcuts** — `↑↓` to switch sessions, `/` to search, `Esc` to go back
- **Dark theme** — Easy on the eyes, consistent with Claude Code's terminal aesthetic

## Quick Start

### Prerequisites

- Node.js >= 18

### Usage

Run directly with npx:

```bash
npx chat-logbook
```

Or install globally for a shorter command:

```bash
npm install -g chat-logbook
chat-log
```

Then open the URL shown in your terminal.

### Troubleshooting

**"No conversations found"**
Make sure you have Claude Code conversation history at `~/.claude/`. chat-logbook reads from this directory automatically.

**Port already in use**
By default, chat-logbook runs on port 3000. If that port is occupied, it will automatically try the next available port.

## How It Works

chat-logbook reads conversation data directly from the JSONL files that Claude Code stores in `~/.claude/`. It **never modifies** these files — your original conversation data is always left untouched.

User-created data (custom titles, tags, annotations, highlights) is stored in a separate SQLite database at `~/.chat-logbook/data.db`, using the session ID as the link between the two data sources.

Because chat-logbook relies on what Claude Code persists to disk, **only conversations that are written to `~/.claude/` are visible**. Ephemeral interactions that Claude Code does not persist (such as `/btw` side questions) are not captured by Claude Code's storage and therefore cannot be displayed.

## FAQ

### Why can't I see my `/btw` conversations?

The `/btw` feature in Claude Code is designed to be ephemeral — questions and answers appear in a temporary overlay and are never written to conversation history files. Since chat-logbook reads from these files, `/btw` exchanges are not available.

This is by design: `/btw` is intended for quick, throwaway questions. If you want a conversation to be preserved and visible in chat-logbook, use a regular message instead of `/btw`.

### Is my data safe?

Yes. chat-logbook is fully local — no data ever leaves your machine. It only **reads** from `~/.claude/` and never modifies your original conversation files. The SQLite database it creates for your tags, annotations, and other metadata is stored separately at `~/.chat-logbook/`.

### Does chat-logbook work with Claude Code on the web?

No. chat-logbook reads from local `~/.claude/` files, which are only created by the Claude Code CLI running on your machine. Conversations run via Claude Code on the web (cloud VMs) are not stored locally and are not accessible to chat-logbook.

## Roadmap

- **Title editing** — Customize session titles for easier identification
- **Tag system** — Add color-coded tags to sessions, filter by multiple tags (AND logic)
- **Annotations** — Add notes next to any message in a conversation
- **Highlights** — Mark important text within conversations

## License

[MIT](LICENSE)
