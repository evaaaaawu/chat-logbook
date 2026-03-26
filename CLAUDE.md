# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

chat-logbook is a local-first conversation manager for Claude Code. It provides a browser-based UI to browse, tag, annotate, and organize Claude Code conversation history stored in `~/.claude/`.

Key design principles:

- **Read-only access to `~/.claude/`** — never modify original Claude Code conversation files
- **Separate user data store** — custom titles, tags, annotations, and highlights live in a SQLite database at `~/.chat-logbook/data.db`, linked by session ID
- **Local-only** — no data leaves the user's machine

## Architecture

- **Data source**: JSONL files from `~/.claude/` (read-only)
- **User metadata**: SQLite database at `~/.chat-logbook/data.db`
- **UI**: Three-column layout (filters | session list | conversation content) with dark theme
- **Real-time updates**: SSE for streaming active conversations
- **Runtime**: Node.js >= 18
- **Distribution**: npm package, runnable via `npx chat-logbook` or global install (`chat-log` command)

## Status

This project is in early development. The README describes planned features; implementation has not yet begun.

## Branch Strategy

- Create a feature branch for each task: `<type>/<short-description>` (e.g., `feat/add-auth`, `fix/null-response`)
- Open a PR to merge into `main`
- Do not push directly to `main`
