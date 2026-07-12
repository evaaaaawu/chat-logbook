# chat-logbook

> _Where your AI conversations live._

A local-first library for the conversations you've had with your AI tools. Read by chat-logbook, kept on your machine, browsable and searchable in one place — even after your AI tool has deleted the original.

> **Status.** A personal side project, moving at side-project pace — development and responses happen as time allows. Early release: browsing, rendering, tags, soft-delete, and a local archive that survives vendor cleanup all work today. Search is next. See [Roadmap](#roadmap).

## What chat-logbook is

You open it from the command line, and a browser window opens onto your conversation history. You can browse it, find anything in it, tag what matters, and pick up where you left off.

It reads the files your AI tools already write to your machine — Claude Code today, with more tools planned. From there it keeps its own copy in a private archive on your machine, so the history is yours even when the source tool quietly cleans up after itself (Claude Code defaults to deleting conversations older than 30 days).

Nothing leaves your machine. There is no account to create. The original
files your AI tools wrote are never modified.

We built this because the right place for your AI conversations to live isn't inside the next vendor change.

## What it gives you

- **Read-only access to source directories.** Original conversation files are never modified. Today that means `~/.claude/`; the same rule applies to every agent we add.
- **Local-only.** No telemetry, no analytics, no third-party calls.
- **Zero configuration.** Install and run.
- **Drive everything from the keyboard.** A `/` or `⌘K` overlay finds any past conversation in seconds. The mouse still works, but every primary action has a binding.
- **Your archive is yours.** It's a single SQLite file at `~/.chat-logbook/archive.db`. Copy it to back up. Open it with any tool that reads SQLite. If chat-logbook disappears tomorrow, the archive doesn't.

The full problem statement, user stories, and direction live in the [PRD](docs/PRD.md).

## What works today

**Reading**

- **Three-column layout.** Resizable panels for filters, chat list, and conversation — in a Solarized Dark theme that matches Claude Code's terminal.
- **Rich rendering.** Markdown, syntax-highlighted code, collapsible tool calls with one-line summaries, and collapsible thinking.
- **Long chats stay fast.** A conversation opens at its latest message and scrolls smoothly however far it runs; a corner button, `⌘↑` / `⌘↓` (`Ctrl` elsewhere), or `Home` / `End` jump to the start or the latest.
- **Metadata at a glance.** The ⓘ in the header shows when a chat started and last changed, its agent, project, and IDs — with one-click copy.

**Finding & organizing**

- **A list that scales.** Loads on demand as you scroll and stays fast across tens of thousands of chats. Walk it with `↑` / `↓` — each row opens as you land on it.
- **Sort that sticks.** By title, created, or updated time; the choice holds between visits, and Trash sorts on its own.
- **Tags and filters.** Tag chats with colored chips, then narrow the list to a project or to tags — matching every tag you pick or any one.
- **Custom titles.** Rename from the list or the header (`F2` / `↵`); clear a title to fall back to the first message.

**Keeping your history**

- **Local archive.** Every chat is copied to `~/.chat-logbook/archive.db`, so it stays even after the source file is gone.
- **Live updates.** New and changed chats surface within seconds — no refresh. With a chat open, its new messages stream in live, so you can watch a running session unfold.
- **Trash, not delete.** Move chats out one or many at a time and restore them anytime. Source directories like `~/.claude/` stay read-only, always.

## Quick start

Requirements: Node.js 20 or later.

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

A browser window opens automatically, showing a list of your Claude Code chats on the left and conversation content on the right.

### Troubleshooting

**"No conversations found."**
You need to have Claude Code conversation history at `~/.claude/`. chat-logbook reads from this directory automatically.

**"Port already in use."**
chat-logbook runs on port 3100 by default. Use `chat-log --port 8080` (or `PORT=8080 chat-log`) to pick a different port.

**Updating to the latest version.**
Run `npm install -g chat-logbook@latest`. If you use npx, the `@latest` tag ensures you always run the newest version.

## FAQ

### Does chat-logbook work with Claude Code on the web?

No. chat-logbook reads from local `~/.claude/` files, which are only created by the Claude Code CLI on your machine. Conversations run via Claude Code on the web (cloud VMs) are not stored locally and aren't visible to chat-logbook.

### Why can't I see my `/btw` conversations?

`/btw` is designed to be ephemeral — questions and answers appear in a temporary overlay and are never written to conversation history files. For a conversation to be preserved and visible in chat-logbook, send a regular message instead.

### Will chat-logbook lose my history if Claude Code deletes its files?

Once chat-logbook has read a conversation into its archive, vendor cleanup of the original file no longer removes it from chat-logbook. The archive's contract: never delete in response to source deletion. Only an explicit user action (Hard Delete / Purge) removes archived conversations.

### Where is my data stored?

Three places, all on your machine:

- `~/.claude/` (and equivalents for other tools) — read-only source.
- `~/.chat-logbook/archive.db` — chat-logbook's copy of the conversations it has read.
- `~/.chat-logbook/metadata.db` — your tags, titles, annotations, and soft-delete flags.

Back up the two `~/.chat-logbook/` files together; they are the complete chat-logbook state.

### Is this affiliated with Anthropic / OpenAI?

No. chat-logbook reads files those tools write on your machine. It doesn't talk to their servers and isn't endorsed by them.

## Roadmap

**Spotlight search.** A keyboard-driven overlay (`⌘K` or `/`) that searches across chats, messages, tags, and projects from one input. A match lands you on the exact message with the term highlighted, and you can jump between every match without leaving the overlay.

Beyond this, several smaller things are on the list without firm timing — annotations and highlights for marking what matters, editing your own past messages, CLI commands for working with conversations from a terminal. Some will ship; some are still being weighed.

Explicit non-goals: semantic / vector search, cloud sync inside the OSS core, modification of source directories like `~/.claude/`, and bulk export to bespoke formats (the archive itself is the export). See the [PRD](docs/PRD.md) for the full out-of-scope list.

This project is **not affiliated with Anthropic, OpenAI, or any other AI provider.** It reads files those tools write on your machine; it does not talk to their servers and is not endorsed by them.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Contributing

Chat Logbook is in very early development. To keep focus on the current goals, we're not taking contributions right now.

If there's something you really need — or you'd genuinely like to help — reach out directly and we can talk through it.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

You are free to use, modify, and distribute this software under the terms of the AGPL-3.0. If you modify the program and make it available over a network, you must release your modified source code under the same license.

For commercial licensing inquiries, contact the author.
