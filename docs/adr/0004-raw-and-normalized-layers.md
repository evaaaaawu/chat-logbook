# Store Raw and Normalized layers; parse at ingestion, not at serve

The Archive keeps two layers: **Raw** (the verbatim per-Agent record, preserved untouched and not rebuildable) and **Normalized** (the standardized Message shape the API, UI, and Index read). Normalizing happens once at ingestion, not on every read.

The payoff: a parser bug is fixed by re-ingesting affected rows rather than changing the read path, and because Normalized is rebuildable from Raw, schema changes to the Normalized layer never need the (possibly already-deleted) Source. Raw bytes are preserved across all schema migrations.
