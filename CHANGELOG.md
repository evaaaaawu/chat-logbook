# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.1] - 2026-05-07

### Fixed

- Declare `better-sqlite3` as a runtime dependency in the root `package.json` so global `npm install -g chat-logbook` no longer fails at startup with `ERR_MODULE_NOT_FOUND`. The bundled API entry point imports it as an external module, but it was missing from the published package's dependencies in v0.3.0.

## [0.3.0] - 2026-05-07

### Added

- SQLite-backed metadata store at `~/.chat-logbook/data.db` with Drizzle ORM and drizzle-kit migrations. Database file and schema are created automatically on first launch.
- Repository pattern (`MetadataRepository`) wrapping all SQLite access; underpins this and future write features (titles, tags, annotations).
- Soft delete and restore for sessions — endpoints `DELETE /api/sessions/:id`, `POST /api/sessions/:id/restore`, and `GET /api/sessions?includeDeleted=true` for listing deleted sessions. Original `~/.claude/` files are never touched. Endpoints follow GitHub/Stripe-style hybrid semantics: 404 when the session ID is unknown to the source, 204 when the operation is a no-op (idempotent on terminal states).
- Equal-height (48px) headers across the three columns, plus a new conversation header showing the selected session's title and project.
- Trash sidebar entry with deleted-count badge.
- Hover-only delete chip on each row, right-click context menu with Delete / Restore items, and a top-center Undo / Restore toast (5s, single instance).
- Keyboard shortcuts: Backspace deletes the selected session, Cmd+Z (or Ctrl+Z) undoes within the toast window, Esc exits Trash mode. Editable elements (input/textarea/contentEditable) are exempted.
- Trash mode that replaces the middle column with deleted sessions, sorted by deleted time. Includes Back link, deleted-banner with Restore button in the conversation view, and empty-state copy for both modes.

### Fixed

- Playwright e2e route pattern updated to match `?includeDeleted=true` query string after `useSessions` started passing it.

## [0.2.1] - 2026-04-16

### Changed

- License changed from MIT to AGPL-3.0-only to support planned open core model
- README rewritten to accurately reflect current project state — removed unimplemented features from feature list, added status block, architecture overview, and development guide
- Organized .gitignore and .npmignore files

## [0.2.0] - 2026-04-09

### Added

- Collapsible tool calls and thinking blocks in conversation view
- Tool call summary generation for clearer conversation overview
- Syntax highlighting for code blocks with dedicated CSS
- Virtual scrolling for improved performance on long conversations
- Playwright E2E test for virtual scrolling
- GitHub Actions CI pipeline for PR checks

### Fixed

- Capitalize app title to "Chat Logbook"
- Use pnpm filter to run Playwright install from web workspace

## [0.1.2] - 2026-04-08

### Changed

- Improved Quick Start section in README and set Node.js minimum requirement to >= 20

## [0.1.1] - 2026-04-07

### Added

- Auto-open default browser on startup
- Update notification when a newer version is available on npm

### Changed

- Startup message improved to "chat-logbook is running at <url>" with colored clickable URL

## [0.1.0] - 2026-04-07

### Added

- Claude Data Parser for reading `~/.claude/` JSONL conversation files
- API endpoints for listing sessions and viewing conversation messages
- Three-column resizable layout (filter panel, session list, conversation view)
- Markdown rendering with react-markdown and remark-gfm
- Solarized Dark theme
- Production build pipeline (Vite + tsup)
- CLI entry points (`chat-logbook` and `chat-log` commands)
- Static file serving in production mode via Hono
- Configurable port via `PORT` environment variable (default: 3100)
- Friendly error message on port conflict

### Fixed

- Filter out sessions without conversation files
- Handle missing session gracefully instead of white screen crash
