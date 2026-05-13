# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-05-14

Your conversations now live in chat-logbook's own archive, not just in Claude Code's files. If Claude Code prunes a session or you accidentally delete a JSONL, it stays visible here.

### Added

- A local archive at `~/.chat-logbook/archive.db`. On startup, `chat-logbook` scans `~/.claude/projects/` and copies any new conversations into it. Subsequent starts are cheap — unchanged files are skipped.
- Sessions stay in the UI even after the original JSONL is gone. Back up `~/.chat-logbook/` to keep that history across machines.

### Changed

- The project label next to each session is now the real directory name (e.g. `chat-logbook`), read from the conversation's working directory. Earlier builds sometimes showed the encoded folder name (`-Users-…-chat-logbook`).

## [0.3.1] - 2026-05-07

### Fixed

- `npm install -g chat-logbook` no longer fails to start with a missing-module error. (v0.3.0 was published without declaring `better-sqlite3` as a dependency.)

## [0.3.0] - 2026-05-07

You can now delete sessions you don't want to see anymore, and get them back if you change your mind. Your original `~/.claude/` files are never touched.

### Added

- Delete and restore sessions. Hover a row for the delete chip, or right-click for Delete / Restore. A toast at the top gives you 5 seconds to undo.
- Trash view in the sidebar, with a count badge. Click it to see deleted sessions sorted by when you deleted them, and restore from there.
- Keyboard shortcuts: `Backspace` deletes the selected session, `Cmd+Z` / `Ctrl+Z` undoes within the toast window, `Esc` exits Trash. Shortcuts are off while you're typing in an input.
- The conversation header now shows the selected session's title and project, aligned with the column headers across the layout.
- A new database file at `~/.chat-logbook/data.db` stores your deletes (and, later, titles and tags). Back this up if you want to keep that state across machines.

## [0.2.1] - 2026-04-16

### Changed

- License changed from MIT to AGPL-3.0-only.
- README rewritten to match what's actually shipped today — features list, status, architecture, and how to develop locally.

## [0.2.0] - 2026-04-09

Conversations with long tool output and code blocks are easier to read and faster to scroll through.

### Added

- Tool calls and thinking blocks are collapsible, with a one-line summary so you can scan a long conversation without scrolling through every expanded payload.
- Code blocks now render with syntax highlighting.
- Long conversations use virtual scrolling, so opening a session with thousands of messages stays responsive.

### Fixed

- App title capitalization fixed to "Chat Logbook".

## [0.1.2] - 2026-04-08

### Changed

- Node.js 20 or newer is now required. The Quick Start section in the README has been updated to reflect this.

## [0.1.1] - 2026-04-07

### Added

- Your default browser opens automatically when you run `chat-logbook`.
- A notification shows up on startup when a newer version is available on npm.

### Changed

- Startup message now reads "chat-logbook is running at <url>" with a colored, clickable URL.

## [0.1.0] - 2026-04-07

Initial release. Browse your Claude Code conversation history in a local web UI — no data leaves your machine.

### Added

- Reads your `~/.claude/` JSONL conversation files directly. The directory is treated as read-only; chat-logbook never writes back into it.
- Three-column resizable layout: filter panel, session list, and conversation view.
- Markdown rendering for messages, with the Solarized Dark theme.
- `chat-logbook` and `chat-log` CLI commands, served on port 3100 by default. Set `PORT` to change it; you'll get a friendly error if the port is busy.
