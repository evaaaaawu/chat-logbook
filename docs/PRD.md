# chat-logbook — Product Requirements

> _Where your AI conversations live._

This document describes what chat-logbook is, who it's for, and the experience it's working toward. It is intended to be readable in a single sitting.

For the current state of features, see the [README](../README.md). For active
work, see [GitHub Milestones](https://github.com/evaaaaawu/chat-logbook/milestones).

## Problem Statement

Anyone who works with AI assistants every day eventually accumulates a pile of conversations — design discussions, debugging sessions, half-explored ideas, useful explanations. These conversations are valuable. They are also surprisingly hard to revisit.

The pain has a name: **"I know I've discussed this before, but I can never find it again."** The cause is structural: most people work with several AI tools, and each tool stores its conversations in its own format, in its own directory, with no way to search across them. Conversations end up scattered across tools that don't talk to each other.

A second pain compounds the first. AI tools quietly clean up after themselves. Claude Code deletes conversations older than 30 days by default. Codex CLI prunes on its own schedule and exposes no setting to change it. The history you'd want to revisit is often gone before you go looking for it.

chat-logbook exists because that fragmentation has no reason to be the default, and your conversation history shouldn't quietly disappear.

## Solution

chat-logbook is a local-first library for your AI conversations. It reads the files AI assistants write on your machine — starting with Claude Code, with more tools planned — and keeps its own copy in a private archive on your machine. From there, it presents everything as a single browsable, searchable, organizable history.

You open chat-logbook from the command line:

```bash
npx chat-logbook@latest
```

A browser window opens. Your conversation history is there. You can browse it, search across it, tag what matters, and pick up where you left off.

Nothing leaves your machine. There is no account to create. The original files your AI tools wrote are never modified. The archive chat-logbook keeps is yours, in a single SQLite file you can open with any tool that reads SQLite.

## Who It's For

chat-logbook is for people who use AI assistants every day and want their conversation history to feel like a personal library — something they own, return to, and build on — rather than something locked inside a tool that might change tomorrow.

If you find yourself jumping between AI tools by task, or noticing that something you discussed weeks ago has become hard to find — or quietly gone — this project is trying to help.

## User Stories

> The user stories below describe the experience this project is aiming toward. Some are already shipped; some are in progress; some remain aspirational. As an independently-maintained project, scope and ordering are subject to change based on what proves valuable in practice, what's technically feasible, and the maintainer's available time.
>
> If a story matters to you, opening an issue or joining a discussion is the best way to influence what gets prioritized. We list these here to make our direction transparent, not to commit to any particular timeline.

Status legend: `[shipped]` `[in progress]` `[aspirational]`

1. As an AI assistant user, I want to view all my historical conversations in a browser, so that I can conveniently review past work. `[shipped]`
2. As an AI assistant user, I want to customize the title of each Chat, so that I can quickly identify topics at a glance. `[in progress]`
3. As an AI assistant user, I want to add one or more tags to a Chat, so that I can categorize conversations in my own way. `[aspirational]`
4. As an AI assistant user, I want to filter by multiple tags at once with AND logic, so that I can precisely find conversations that match several conditions. `[aspirational]`
5. As an AI assistant user, I want to filter conversations by project, so that I can focus on a specific area of work. `[aspirational]`
6. As an AI assistant user, I want to see all projects' conversations by default, so that I don't miss anything. `[shipped]`
7. As an AI assistant user, I want a Spotlight-style overlay search (triggered by `/` or `⌘K`) that instantly finds Chats, Messages, Tags, and Projects from one input, so that finding past conversations feels effortless. `[in progress]`
8. As an AI assistant user, I want to add notes next to any message, so that I can record my own thoughts and takeaways. `[aspirational]`
9. As an AI assistant user, I want to highlight specific text within conversations, so that I can mark what matters. `[aspirational]`
10. As an AI assistant user, I want to Trash (hide) Chats I don't need, so that my list stays clean. `[shipped]`
11. As an AI assistant user, I want to Purge a Chat from chat-logbook's archive when I really want it gone, so that I retain full control over what is and isn't kept. `[aspirational]`
12. As an AI assistant user, I want to see conversations update in real time while an AI tool is actively chatting, so that I can follow along with a more comfortable reading experience than the terminal. `[aspirational]`
13. As an AI assistant user, I want tool calls to be collapsed by default with a one-line summary, so that I can quickly understand what the AI did without being overwhelmed by output. `[shipped]`
14. As an AI assistant user, I want thinking blocks to be collapsed by default but expandable, so that I can occasionally examine the AI's reasoning. `[shipped]`
15. As an AI assistant user, I want full keyboard navigation, so that I can drive the entire app without touching the mouse. `[in progress]`
16. As an AI assistant user, I want tags to have custom colors, so that I can visually distinguish categories at a glance. `[aspirational]`
17. As an AI assistant user, I want chat-logbook to work on macOS, Linux, and Windows. `[shipped]`
18. As an AI assistant user, I want to restore Trashed Chats, so that I can recover from accidental Trashing. `[in progress]`
19. As an AI assistant user, I want a dark theme that matches the look of a terminal, so that it's easy on the eyes. `[shipped]`
20. As an AI assistant user, I want a search match to land me on the exact message inside the Chat, with the matched term marked, so that I don't have to manually scan after finding a hit. `[in progress]`
21. As an AI assistant user, I want to traverse all matches without reopening the search, so that I can compare every occurrence of a keyword fluidly. `[in progress]`
22. As a user of multiple AI assistants, I want chat-logbook to bring conversations from every supported tool into one unified view, so that I can find anything I've discussed regardless of which tool I used. `[aspirational]`
23. As an AI assistant user, I want chat-logbook to keep my conversations even after my AI tool deletes, prunes, or rewrites its internal storage, so that my history is mine and doesn't quietly disappear. `[in progress]`
24. As an AI assistant user, I want each conversation to have a stable short id I can paste anywhere, so that I can reference a past conversation by id from inside any tool — including the AI assistant that wrote it. `[aspirational]`
25. As an AI assistant user, I want to edit my own past messages (with a clear "edited" indicator and the ability to revert), so that I can fix typos or redact sensitive content without losing the original. `[aspirational]`

## Direction

The current focus is making search a first-class experience: a Spotlight-style overlay that searches across Chats, Messages, Tags, and Projects with full keyboard navigation and message-level precision.

After that, the next direction is broader tool coverage — making
chat-logbook genuinely cross-tool by adding parser plugins for additional
AI assistants beyond Claude Code.

Underneath both directions, chat-logbook keeps its own archive of every conversation it has read. The archive is a single SQLite file with a public schema, designed to outlast both the source tool and chat-logbook itself. Features built on top — search, tags, notes, links — stay reliable even as source tools change behind the scenes.

These are intentions, not commitments. Track active work via the
[GitHub Milestones](https://github.com/evaaaaawu/chat-logbook/milestones)
page.

## Out of Scope

These are deliberate non-goals. They will not be added to this project,
even if asked.

- Modifying original AI conversation files. The files your AI tools create are read-only here.
- Telemetry, analytics, or any data leaving your machine.
- Integration with cloud-only chat tools (ChatGPT, Claude.ai, Gemini, Grok, Perplexity, etc.) — they don't store conversations locally, and pulling from their APIs would conflict with this project's local-first principle.
- Bulk export to bespoke formats (Markdown / HTML / PDF dumps). The archive is already a single SQLite file with a public schema — it is the export format. Single-conversation export is covered by the forthcoming `chat-log show` command.
- Enterprise customization (SSO, SOC2, audit logs).

## Open Source & License

chat-logbook is licensed under [AGPL-3.0-only](../LICENSE). You are free to use, modify, and redistribute under those terms. If you run a modified version as a network service, you must release your modified source under AGPL-3.0.

A Contributor License Agreement (CLA) will be required before accepting
external code contributions. The CLA preserves the project's ability to
relicense in the future if necessary, while ensuring contributions remain
available to everyone.

This project is **not affiliated with Anthropic, OpenAI, or any other AI provider.** chat-logbook reads files those tools create on your machine; it does not communicate with their servers and is not endorsed by them.
