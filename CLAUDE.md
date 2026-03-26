# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

chat-logbook is a local-first conversation manager for Claude Code. It provides a browser-based UI to browse, tag, annotate, and organize Claude Code conversation history stored in `~/.claude/`.

Key design principles:

- **Read-only access to `~/.claude/`** — never modify original Claude Code conversation files
- **Separate user data store** — custom titles, tags, annotations, and highlights live in a SQLite database at `~/.chat-logbook/data.db`, linked by session ID
- **Local-only** — no data leaves the user's machine

## Architecture

- **Monorepo**: pnpm workspaces with `api/` (Hono backend) and `web/` (React frontend)
- **Data source**: JSONL files from `~/.claude/` (read-only)
- **User metadata**: SQLite database at `~/.chat-logbook/data.db`
- **UI**: Three-column layout (filters | session list | conversation content) with dark theme
- **Real-time updates**: SSE for streaming active conversations
- **Runtime**: Node.js >= 18
- **Distribution**: npm package, runnable via `npx chat-logbook` or global install (`chat-log` command)

## Project Structure

```
api/                  # Hono backend
  src/
    app.ts            # Hono app factory (accepts claudeDir for testability)
    parser.ts         # Claude Data Parser (reads ~/.claude/ JSONL files)
    index.ts          # Production entry point with @hono/node-server
web/                  # React frontend (not yet implemented)
```

## Development

```bash
pnpm install          # Install all dependencies
pnpm run test         # Run all tests (delegates to each workspace)
pnpm run typecheck    # Type-check all workspaces
pnpm run dev          # Start dev servers for all workspaces
```

## Status

Backend API is implemented (session listing, conversation reading). Frontend is in progress.

## Branch Strategy

- Create a feature branch for each task: `<type>/<short-description>` (e.g., `feat/add-auth`, `fix/null-response`)
- Open a PR to merge into `main`
- Do not push directly to `main`
