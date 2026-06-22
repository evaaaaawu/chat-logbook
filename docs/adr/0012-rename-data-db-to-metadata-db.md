# Rename data.db to metadata.db

The user-added store is named **Metadata** in the glossary, but the file on disk is `data.db` — a name with no bearing meaning, since every store holds data. Rename it to `metadata.db` so the file matches the vocabulary and an AI agent grepping for "metadata" finds it.

This changes a path on users' disks, so it needs a migration that detects and renames an existing `data.db`. It should land before 1.0, in the spirit of the v0.8.0 `session` → `chat` rename: picking the right noun before 1.0 is worth the one-time break.
