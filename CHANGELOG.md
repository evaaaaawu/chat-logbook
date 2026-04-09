# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
