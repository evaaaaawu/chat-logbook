---
status: accepted
---

# Rename data.db to metadata.db

The user-added store is named **Metadata** in the glossary, but the file on disk is `data.db` — a name with no bearing meaning, since every store holds data. Rename it to `metadata.db` so the file matches the vocabulary and an AI agent grepping for "metadata" finds it.

This changes a path on users' disks, so it needs a migration that detects and renames an existing `data.db`. It should land before 1.0, in the spirit of the v0.8.0 `session` → `chat` rename: picking the right noun before 1.0 is worth the one-time break.

## Status

Accepted — the Metadata store opens `metadata.db`, and `createMetadataRepository` renames an existing `data.db` in place on launch (`api/src/metadata/repository.ts`). A same-filesystem rename is atomic and loses no data; if `metadata.db` already exists the rename is skipped and the stale `data.db` is left untouched, never clobbered.
