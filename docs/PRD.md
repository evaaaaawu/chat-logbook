# chat-logbook — Product Requirements

> _Where your AI conversations live._

This document describes what chat-logbook is, who it's for, and the experience
it's working toward. It is intended to be readable in a single sitting.

For the current state of features, see the [README](../README.md). For active
work, see [GitHub Milestones](https://github.com/evaaaaawu/chat-logbook/milestones).

## Problem Statement

Anyone who works with AI assistants every day eventually accumulates a
significant body of conversation history — design discussions, debugging
sessions, half-explored ideas, useful explanations. These conversations are
valuable. They are also surprisingly hard to revisit.

The pain has a name: **"I know I've discussed this before, but I can never
find it again."** It has a structural cause: most people work with multiple
AI tools, and each tool stores its conversations in its own format, in its
own directory, with no way to search across them. Conversations end up
scattered across tools that don't talk to each other.

chat-logbook exists because that fragmentation has no reason to be the default.

## Solution

chat-logbook is a local-first library for your AI conversations. It reads
conversation files that AI assistants write on your machine — starting with
Claude Code, with more tools planned — and presents them as a single
browsable, searchable, organizable history.

You open chat-logbook from the command line:

```bash
npx chat-logbook@latest
```

A browser window opens. Your conversation history is there. You can browse
it, search across it, tag what matters, and pick up where you left off.

Nothing leaves your machine. There is no account to create. The original
files written by your AI tools are never modified.

## Who It's For

chat-logbook is for people who use AI assistants every day and want their
conversation history to feel like a personal library — something they own,
return to, and build on — rather than something locked inside a tool that
might change tomorrow.

If you find yourself jumping between AI tools by task, or noticing that
something you discussed weeks ago has become hard to find, this project is
trying to help.

## User Stories

> The user stories below describe the experience this project is aiming
> toward. Some are already shipped; some are in progress; some remain
> aspirational. As an independently-maintained project, scope and ordering
> are subject to change based on what proves valuable in practice, what's
> technically feasible, and the maintainer's available time.
>
> If a story matters to you, opening an issue or joining a discussion is
> the best way to influence what gets prioritized. We list these here to
> make our direction transparent, not to commit to any particular timeline.

Status legend: `[shipped]` `[in progress]` `[aspirational]`

1. As an AI assistant user, I want to view all my historical conversations
   in a browser, so that I can conveniently review past work. `[shipped]`
2. As an AI assistant user, I want to customize the title of each
   conversation session, so that I can quickly identify topics at a glance.
   `[in progress]`
3. As an AI assistant user, I want to add one or more tags to a session,
   so that I can categorize conversations in my own way. `[aspirational]`
4. As an AI assistant user, I want to filter by multiple tags at once with
   AND logic, so that I can precisely find conversations that match
   several conditions. `[aspirational]`
5. As an AI assistant user, I want to filter conversations by project, so
   that I can focus on a specific area of work. `[aspirational]`
6. As an AI assistant user, I want to see all projects' conversations by
   default, so that I don't miss anything. `[shipped]`
7. As an AI assistant user, I want a Spotlight-style overlay search
   (triggered by `/` or `⌘K`) that instantly finds sessions, messages,
   tags, and projects from one input, so that finding past conversations
   feels effortless. `[in progress]`
8. As an AI assistant user, I want to add notes next to any message, so
   that I can record my own thoughts and takeaways. `[aspirational]`
9. As an AI assistant user, I want to highlight specific text within
   conversations, so that I can mark what matters. `[aspirational]`
10. As an AI assistant user, I want to soft-delete (hide) sessions I
    don't need, so that my list stays clean. `[in progress]`
11. As an AI assistant user, I want to see conversations update in real
    time while an AI tool is actively chatting, so that I can follow
    along with a more comfortable reading experience than the terminal.
    `[aspirational]`
12. As an AI assistant user, I want tool calls to be collapsed by default
    with a one-line summary, so that I can quickly understand what the
    AI did without being overwhelmed by output. `[shipped]`
13. As an AI assistant user, I want thinking blocks to be collapsed by
    default but expandable, so that I can occasionally examine the AI's
    reasoning. `[shipped]`
14. As an AI assistant user, I want full keyboard navigation, so that I
    can drive the entire app without touching the mouse. `[in progress]`
15. As an AI assistant user, I want tags to have custom colors, so that
    I can visually distinguish categories at a glance. `[aspirational]`
16. As an AI assistant user, I want chat-logbook to work on macOS, Linux,
    and Windows. `[shipped]`
17. As an AI assistant user, I want to restore soft-deleted sessions, so
    that I can recover from accidental deletes. `[in progress]`
18. As an AI assistant user, I want a dark theme that matches the look of
    a terminal, so that it's easy on the eyes. `[shipped]`
19. As an AI assistant user, I want a search match to land me on the
    exact message inside the session, with the matched term marked, so
    that I don't have to manually scan after finding a hit.
    `[in progress]`
20. As an AI assistant user, I want to traverse all matches without
    reopening the search, so that I can compare every occurrence of a
    keyword fluidly. `[in progress]`
21. As a user of multiple AI assistants, I want chat-logbook to bring
    conversations from every supported tool into one unified view, so
    that I can find anything I've discussed regardless of which tool I
    used. `[aspirational]`

## Direction

The current focus is making search a first-class experience: a Spotlight-
style overlay that searches across sessions, messages, tags, and projects
with full keyboard navigation and message-level precision.

After that, the next direction is broader tool coverage — making
chat-logbook genuinely cross-tool by adding parser plugins for additional
AI assistants beyond Claude Code.

These are intentions, not commitments. Track active work via the
[GitHub Milestones](https://github.com/evaaaaawu/chat-logbook/milestones)
page.

## Out of Scope

These are deliberate non-goals. They will not be added to this project,
even if asked.

- Modifying original AI conversation files. The files your AI tools
  create are read-only here.
- Telemetry, analytics, or any data leaving your machine.
- Integration with cloud-only chat tools (ChatGPT, Claude.ai, Gemini,
  Grok, Perplexity, etc.) — they don't store conversations locally, and
  pulling from their APIs would conflict with this project's local-first
  principle.
- Enterprise customization (SSO, SOC2, audit logs).

## Open Source & License

chat-logbook is licensed under [AGPL-3.0-only](../LICENSE). You are free
to use, modify, and redistribute under those terms. If you run a modified
version as a network service, you must release your modified source under
AGPL-3.0.

A Contributor License Agreement (CLA) will be required before accepting
external code contributions. The CLA preserves the project's ability to
relicense in the future if necessary, while ensuring contributions remain
available to everyone.

This project is **not affiliated with Anthropic, OpenAI, or any other AI
provider.** chat-logbook reads files those tools create on your machine; it
does not communicate with their servers and is not endorsed by them.
