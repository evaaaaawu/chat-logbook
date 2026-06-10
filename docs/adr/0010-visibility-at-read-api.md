# Enforce Visibility at the read API, never in storage or the Index

Visibility — Trash today, and any future flag — lives only in the Metadata store and is applied as a read-time JOIN. The Archive, the Index, and ingestion stay unaware of it.

## Considered and rejected

Syncing visibility into the Index. Three reasons against it:

- **Asymmetric toggle frequency** — Trashing is frequent and cheap; rebuilding the Index is expensive.
- **Fragile cross-DB triggers** — keeping the Index in sync would need SQLite `ATTACH` and cross-database triggers, which are brittle.
- **The Index must stay freely rebuildable** — it can't carry state that isn't derivable from the Archive.

Enforcing visibility in one place also prevents the class of bug where the list hides a Chat but search still finds it.
