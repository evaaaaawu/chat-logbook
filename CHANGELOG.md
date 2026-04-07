# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
