# Separate Source, Archive, Metadata, and Index into four stores

chat-logbook keeps four stores with distinct durability postures and never merges them: **Source** (vendor-controlled, read-only), **Archive** (our durable derived copy — the only copy once a vendor cleans up Source), **Metadata** (user-added titles, tags, notes, and visibility flags), and **Index** (a freely rebuildable search index). Merging any two re-couples concerns the layout exists to keep apart — an Index schema change could put user data at risk, or vendor cleanup could cascade into the durable copy.

## Consequences

- Reads join across stores rather than hitting one table.
- Each store has its own migration lineage and backup posture (Archive and Metadata are backup-worthy; Index is `rm` + rebuild; Source is out of our hands).
- The Metadata store's file is `data.db` today; see [ADR-0012](0012-rename-data-db-to-metadata-db.md).
