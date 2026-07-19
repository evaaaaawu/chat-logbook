# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.22.0] - 2026-07-19

The conversation pane now reads like a document instead of a chat feed. Each turn is labelled with who spoke and when, empty turns no longer clutter the view, and every tool call folds into a single tidy row you can expand when you want the detail.

### Changed

- The conversation now flows as a note-style document rather than left/right chat bubbles. Turns span the full column, and only your own turns carry a background block so you can scan for where you spoke.
- Each turn shows a one-line header naming who spoke — `You`, or the assistant's display name — alongside the absolute date and time, so an archive read weeks later still tells you when each message happened.
- A tool call and its result are now paired into one collapsible row: a chevron, an icon, and a one-line summary. Expand it to see the full input and output, which scroll sideways instead of stretching the pane. Failed tool calls show a red dot, and only widen when you open them.

### Fixed

- Turns that would render nothing — tool-result-only turns, or assistant turns with empty thinking — are no longer shown as blank blocks.

## [0.21.0] - 2026-07-17

Tags now work on a whole set of chats, not one at a time. Pick a few chats — or every chat matching your current filter — and add or remove tags across all of them in one go.

### Added

- Tag several chats at once. Select chats, click `Tag` in the batch bar, and the picker shows which tags the set already holds: all of them, some of them, or none. Click a row to add it everywhere or remove it everywhere, then `Done` applies the lot. An Undo toast lets you take it back.
- Select every chat matching your current filter, not just the ones you've scrolled to. Start a selection and a `Select all N` link appears in the batch bar; `⌘A` (`Ctrl` elsewhere) does the same. A banner tells you the whole filtered set is selected, and `Esc` or `Clear selection` gets you out. Tag and Move to Trash then act on all of them.
- `Add/Remove Tag` in the right-click menu of a chat, between `Rename` and `Move to Trash`. A checked row means the chat has that tag; clicking assigns or removes it right away, creating the tag if it's new.

### Changed

- `Move to Trash` for a single chat now lives only in the right-click menu — the hover button on each row is gone. The Trash view keeps its inline `Restore`.
- The tag picker closes with a `Done` button in the bottom-right, or by pressing `Enter`.
- `Tag` and `Move to Trash` in the batch bar read as buttons now, with colored hover, instead of blending into the bar.

### Fixed

- Tooltips in the batch bar no longer slide under the sidebar when the bar sits at the left edge of the panel.

## [0.20.0] - 2026-07-13

Chat Logbook now looks like itself in your browser. Its own mark shows in the tab and the sidebar, with `Chat Logbook` as the tab title.

### Changed

- The browser tab shows the Chat Logbook mark and the title `Chat Logbook`, replacing the default Vite icon and the `web` placeholder. The sidebar header shows the same mark in place of the plain square.

## [0.19.0] - 2026-07-11

With a chat open, messages from a running chat now show up live — chat-logbook works as a monitor for a chat in progress, no reopening needed.

### Added

- Open chats update live while a chat is running. New messages appear on their own, without reopening the chat.
- When new messages arrive while you've scrolled up, your place is kept — the view doesn't jump. A `New messages` pill appears at the bottom, and a divider marks where the unread messages begin. Click the pill to jump to that divider and read from the start of what's new.

## [0.18.1] - 2026-07-09

### Fixed

- `⌘↑` / `⌘↓` (`Ctrl` elsewhere) to jump to the top or the latest message no longer also walks the chat list — or switches which chat is open — at the same time. List arrow navigation and the conversation jumps stay separate now.

## [0.18.0] - 2026-07-09

Move around long conversations without endless scrolling. Jump to the start or the latest message in one click or one keystroke, and chats now open where the action is — the end.

### Added

- Jump to the start or the latest message of a conversation. A button in the bottom-right corner shows the direction that makes sense for where you are — "back to top" when you're at the bottom, "jump to latest" otherwise. From the keyboard, use `⌘↑` / `⌘↓` (`Ctrl` elsewhere) or `Home` / `End`.

### Changed

- Opening a chat now lands on the latest messages instead of the top, so you see how a chat ended first.

## [0.17.0] - 2026-07-09

Pick several chats at once and move them to the Trash together, instead of one at a time. Your conversations also read better now — markdown formatting shows up the way it was written.

### Added

- Select multiple chats and move them all to the Trash in one action. Click to start a selection, add more chats to it, then move the whole set at once. Your original `~/.claude/` files are never touched.

### Changed

- Conversations now render their markdown — headings, bold, lists, and code blocks appear formatted instead of as flat text, with spacing tuned for reading.
- Keyboard hints show the right keys for your machine: `⌘` on Mac, `Ctrl` elsewhere.

### Fixed

- Reloading now drops chats that no longer belong in the current view. After you move a chat out of a filter, a reload reflects that instead of leaving a stale row behind.

## [0.16.0] - 2026-07-06

Move through your chat list with the keyboard. Press the arrow keys to walk up and down the list and open each chat as you land on it — no reaching for the mouse.

### Added

- Arrow-key navigation in the chat list. `ArrowUp` and `ArrowDown` move a cursor through the rows and open the chat you land on. Holding or tapping the arrows quickly loads once when you settle, not once per row, so fast scrolling stays smooth.
- Keyboard and mouse stay in sync. Clicking a row picks up the cursor there, so the next arrow keypress continues from where you clicked. Typing in a title field or inside a popover is never hijacked by the arrow keys.

## [0.15.0] - 2026-07-05

You can now match tags by _any_ instead of _all_. Pick a few tags and choose whether a chat needs every one or just one of them to show up.

### Added

- A Match control on the tag filter lets you switch between **All** and **Any**. **All** keeps the current behavior — a chat shows only if it has every tag you picked. **Any** widens the list to chats that have at least one of them.

## [0.14.0] - 2026-07-02

Your chat list now stays fast no matter how large your history grows, and it updates on its own as new chats come in.

### Changed

- The chat list loads in pages as you scroll instead of pulling your whole history up front. Opening the app stays fast even with tens of thousands of chats, and scrolling stays smooth because only the rows on screen are rendered.
- The list updates live as chats are recorded. New and changed chats show up on their own, without a manual refresh, while your scroll position and sort order stay put.
- Sorting, project and tag filters, and the Trash view now run against your full history on the server. The counts in the navigation panel, the list total in the header, and the Trash badge reflect everything that matches your filters — not just the chats currently loaded.

## [0.13.0] - 2026-06-23

Group and find chats your own way. You can now tag chats and filter the list by tag or by project, so the chats you care about are one click away.

### Added

- Tag your chats. Create a tag, assign it to any chat, and see it as a colored chip on the chat and a dot in the list. Rename or delete tags from the same place.
- Filter the chat list by tag. Pick several tags and the list narrows to chats that have all of them.
- Filter the chat list by project from a new Projects section in the navigation panel.

## [0.12.0] - 2026-06-17

Every chat now has one stable, paste-anywhere id (`clog_a3f7kx`) shown across the API and the metadata panel. This is also a breaking change to the local HTTP API — see the upgrade note below.

### Changed

- Each chat now uses its own id (`clog_a3f7kx`) as the public handle everywhere — in `GET /api/chats` and in every per-chat URL. This id is unique on its own, so chats no longer collide across different agents.
- The chat's metadata panel now shows both a **Chat ID** (the `clog_` handle) and a separate **Source ID** (the original id from `~/.claude/`).

### Upgrade notes

- **Breaking (local HTTP API only):** if you call the API directly or have scripts hitting `/api/chats/:id`, you must now pass the `clog_` chat id. The old source id no longer resolves and returns `404`. The `chatId` field in `GET /api/chats` responses is removed; use `id` (the `clog_` handle) instead, with the source id available as the new `sourceId` field. The browser UI updates itself — no action needed if you only use the app.
- Your original `~/.claude/` files and stored data are untouched; nothing to back up or re-index.

## [0.11.0] - 2026-06-15

The chat list now keeps its order steady while you read. Background updates from file changes no longer reshuffle the list under you.

### Changed

- The chat list keeps its order anchored during background updates. Previously, when chat-logbook picked up new messages from disk in the background, the list could re-sort and jump while you were reading it. Now the order stays put until you change the sort or switch views.

### Upgrade notes

- On first launch, the metadata file in `~/.chat-logbook/` is renamed from `data.db` to `metadata.db` automatically, and a new `checkpoint.db` is created to track scan progress. Both happen on their own — nothing to back up or move.

## [0.10.0] - 2026-05-27

You can now sort your chat list — by title, created time, or updated time — and your choice is remembered the next time you open the app. Trash keeps its own sort order, defaulting to whatever you deleted most recently.

### Added

- Sort your chat list by title (A–Z), created time, or updated time. The app remembers your choice between visits.
- Trash now has its own independent sort order and can be sorted by when each chat was deleted, with the most recently deleted shown first by default.

## [0.9.0] - 2026-05-21

Each chat now has a metadata popover. Click the ⓘ at the right of the conversation header to see when the chat started and was last updated, which agent it came from, the full project path on disk, and the chat's IDs and source file — with one-click copy for the path and the IDs.

### Added

- Chat metadata popover behind the ⓘ button in the conversation header. Shows created and updated times (formatted `YYYY-MM-DD HH:mm` with a relative suffix like `· 3 days ago`), the AI agent name, the full project working directory, the chat ID, the source ID, and the source file path.
- Click-to-copy on the four path / identifier rows. Hovering a row reveals a copy icon; clicking copies the full untruncated value and shows an inline `Copied` confirmation that fades after ~1.5s.
- The popover stays out of the way of existing keyboard shortcuts. `Tab` reaches the trigger, `Enter` or `Space` opens it, `Esc` closes only the popover (so pressing `Esc` from inside Trash no longer exits Trash by accident).

### Changed

- A chat's "created" time is now the timestamp of its first message rather than when chat-logbook first saw the file. "Updated" is the timestamp of its most recent message. Chats with no messages still fall back to the original first-seen time.
- The chat list header now shows the project basename (e.g. `chat-logbook`); the full path (e.g. `/Users/you/Documents/chat-logbook`) appears in the popover.

### Upgrade notes

- A schema migration adds a `project_path` column to `~/.chat-logbook/archive.db`. It runs automatically on first launch; no action needed. Existing chats fill in the full path the next time chat-logbook scans their source JSONL.

## [0.8.0] - 2026-05-20

We renamed "session" to "chat" everywhere — in the UI, in the local storage schema, and in the HTTP routes. The product supports multiple AI agents and not all of them call a conversation a "session"; "chat" is the cross-agent word and matches the product name. This is the only major thing in this release. Your existing data migrates automatically on first launch.

### Changed (BREAKING)

- The visible terms in the UI are now "Chats" (left column), "Select a chat to view the conversation" (empty state), "This chat is deleted." (banner), and so on. Restore and Move to Trash actions read the same way.
- The local SQLite schema under `~/.chat-logbook/` was renamed. `chat-log` migrates your existing `archive.db` and `data.db` in place on first launch — no rebuild, no data loss. Back up `~/.chat-logbook/` before upgrading if you want a safety net.
- If you've built anything against the HTTP endpoints, `/api/sessions*` is now `/api/chats*`, and the JSON payload key changed from `{ sessions: [...] }` to `{ chats: [...] }`.

## [0.7.1] - 2026-05-15

### Fixed

- A session whose first message contains a large pasted image now shows its project. Before, the project label was missing for those sessions.

## [0.7.0] - 2026-05-15

You can now name your sessions. Instead of living with the title auto-generated from the first message, click any title to rename it — the name you choose sticks and shows everywhere that session appears.

### Added

- Give any session your own title. Click its title in the session list or the conversation header to edit it in place, or select a session and press `F2` / `↵`. The custom title replaces the auto-generated one everywhere, and it survives restarts.
- Clear a custom title to fall back to the original first-message text.

### Changed

- Right-clicking a session now offers Rename alongside Move to Trash (renamed from "Delete session"); in Trash it offers Restore. Each menu action shows its keyboard shortcut.

## [0.6.0] - 2026-05-15

The `chat-log` command now answers `--help`, `--version`, and `--port` like every other CLI you use.

### Added

- `chat-log --version` (or `-v`) prints the installed version and exits.
- `chat-log --help` (or `-h`) shows usage with the available flags and the `PORT=` env var.
- `chat-log --port 8080` (or `-p 8080`) sets the HTTP port from the command line. `PORT=8080 chat-log` still works for daemon use; the flag wins when both are set.
- Invalid `--port` values (non-numeric, missing, or out of range) now fail fast with a clear error instead of crashing on startup.

## [0.5.0] - 2026-05-14

Your conversations now update live in chat-logbook while an AI tool is still writing — no need to restart to see new messages. And if a vendor cleans up its internal storage behind your back, chat-logbook keeps a record of what disappeared so your archive stays trustworthy.

### Added

- Live updates while an AI tool is actively chatting. Open a session in chat-logbook and watch new messages appear as Claude Code writes them — within seconds of each turn.
- An audit trail when source files vanish. If Claude Code (or another vendor) deletes one of its session files, chat-logbook records the event and keeps your archived copy intact. Your history doesn't quietly disappear.

### Changed

- The update-available banner now shows the moment you start `chat-log`, instead of waiting until the next run.

## [0.4.2] - 2026-05-14

### Fixed

- Sessions in Trash now show their message content again instead of "Session not found".

## [0.4.1] - 2026-05-14

### Fixed

- `chat-log` no longer crashes on startup with `no such column: "session_id"`. The v0.4.0 npm tarball shipped a stale build that referenced a renamed column; reinstall with `npm install -g chat-logbook` to pick up this fix.

## [0.4.0] - 2026-05-14

> ⚠️ Deprecated — see [0.4.1](#041---2026-05-14). Crashes on startup with `no such column: "session_id"`.

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

> ⚠️ Deprecated — see [0.3.1](#031---2026-05-07). Missing `better-sqlite3` dependency causes `ERR_MODULE_NOT_FOUND` on startup.

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
