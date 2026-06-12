# Scan checkpoints live in a separate Checkpoint store

The ingestion scan watermark (the `chat_scan_state` table — per-Source-file last mtime, size, and scan time) was sitting in `archive.db`, where it does two wrong things: it is an app-internal operational table inside the schema [ADR-0003](0003-archive-schema-is-public-export-format.md) reserves as a clean, conversation-only public export format, and it is freely rebuildable state living in the one store that exists to hold the irreplaceable copy. We move it into its own store, `checkpoint.db` (the Checkpoint store), keyed from Source and never backed up. This resolves the ADR-0003 smell and widens the four-store split of [ADR-0001](0001-four-store-split.md) to five.

## Considered options

- **Leave it in `archive.db`.** Simplest, but keeps an app-internal, rebuildable table inside the public export format — the exact thing ADR-0003 forbids.
- **Fold it into `index.db`** (the Index store). Both are rebuildable, so on that axis it fits. Rejected because their rebuild lifecycles must stay independent: Index derives from Archive and is rebuilt on a tokenizer or FTS-schema change, while Checkpoint derives from Source and is "rebuilt" by a full re-scan. Co-locating them means `rm index.db` to rebuild search would also wipe the checkpoint and force an unnecessary full re-scan.
- **Move it into `data.db`** (the Metadata store). Rejected: Metadata is user-owned and backup-worthy; machine-operational state does not belong there and must not be backed up.

## Consequences

- A fifth store. `ARCHITECTURE.md` and `CONTEXT.md` now describe five stores, not four.
- The upgrade needs no data-preserving migration. Because the checkpoint is rebuildable (idempotency is content-based — see [ADR-0005](0005-idempotent-append-only-ingest.md)), `checkpoint.db` starts empty, the old `session_scan_state` table is dropped from `archive.db`, and the next Scan repopulates it. The only cost is one full re-scan after upgrade, which is a safe no-op at the Raw layer.
- Dropping `session_scan_state` from `archive.db` is a subtractive migration, against the normally additive-only rule. It is allowed here for the same reason the v0.8.0 rename was: before 1.0, removing a table that never belonged in the public format makes `archive.db` _more_ compliant with ADR-0003, not less.
- This does not move `ingestion_events`. That table is a non-rebuildable audit trail (unlink, user-purge), so by the rebuildability axis it is Archive-class and stays put — its own ADR-0003 tension is a separate question.
