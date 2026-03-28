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
- **UI**: Three-column resizable layout (filters | session list | conversation content) with Solarized Dark theme
- **Frontend stack**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix UI primitives)
- **Frontend testing**: Vitest + React Testing Library + MSW (Mock Service Worker)
- **Frontend state**: React useState + custom hooks (no external state management library)
- **Dev proxy**: Vite forwards `/api` requests to Hono backend (`http://localhost:3000`)
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
web/                  # React frontend (Vite + shadcn/ui + Solarized Dark)
  src/
    App.tsx           # Root component with three-column resizable layout
    App.test.tsx      # Integration tests (RTL + MSW)
    components/
      FilterPanel.tsx       # Left sidebar (placeholder for filters)
      SessionList.tsx       # Middle panel (session list sorted by updatedAt)
      ConversationView.tsx  # Right panel (messages with markdown rendering)
      ui/                   # shadcn/ui primitives (button, resizable, etc.)
    hooks/
      useSessions.ts  # Fetches and sorts sessions from /api/sessions
      useMessages.ts  # Fetches messages for a selected session
    test/
      handlers.ts     # MSW request handlers with fake data
      server.ts       # MSW server instance
      setup.ts        # Vitest setup (jest-dom, MSW, ResizeObserver mock)
    types.ts          # Shared types (Session, Message, ContentBlock)
    index.css         # Solarized Dark theme via CSS variable overrides
```

## Development

```bash
pnpm install          # Install all dependencies
pnpm run test         # Run all tests (delegates to each workspace)
pnpm run typecheck    # Type-check all workspaces
pnpm run dev          # Start dev servers for all workspaces
```

## Status

Backend API and frontend session browsing are implemented. The app supports listing sessions, viewing conversations with markdown rendering, and a three-column resizable layout with Solarized Dark theme.

## Branch Strategy

- Create a feature branch for each task: `<type>/<short-description>` (e.g., `feat/add-auth`, `fix/null-response`)
- Open a PR to merge into `main`
- Do not push directly to `main`
