# Run ingestion as on-open Scan plus in-process Watcher, with no daemon

Ingestion runs in two modes inside the single Node process: a **Scan** over every Source when the app opens, and a live chokidar **Watcher** while the app runs. There is deliberately no background daemon — no launchd, no systemd.

The trade: nothing is ingested while the app is closed, in exchange for a zero-install footprint and no always-on process. A Source `unlink` only records an audit event; it never deletes Archive rows (see [ADR-0002](0002-never-cascade-delete-archive.md)).
