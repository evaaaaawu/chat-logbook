# Combined filtering intersects per-store id sets in app code

Combined Project + Tag + search filtering computes a candidate Chat id set per store using each store's own indexed query — Tags (AND intersection) from `metadata.db`, Projects (OR union) from the Archive's `chats` table, search hits from the Index — and intersects those sets in application code (the ChatReader), rather than issuing a single cross-database SQL JOIN. This preserves the four-store isolation of [ADR-0001](0001-four-store-split.md) and follows the read-time composition the ChatReader already does keyed by `(agent, source_id)`.

## Consequences

- Each store keeps its own indexes: `chat_tags` with PK `(chat_id, tag_id)` plus a secondary index on `(tag_id)`; the Archive's `chats.project` gets an index. Tag display batches one grouped query into a `Map`, never one query per Chat.
- The `ATTACH`-based single-query approach (one SQL pass doing intersection + `ORDER BY` + keyset pagination across stores) is deferred to the later list-pipeline refactor, where server-side sort + pagination actually needs it. That is the point to revisit this decision and weigh `ATTACH` against the ADR-0001 isolation it would relax.
- Trade-off: app-side intersection is fine while the frontend loads the full filtered list (the current model), but is not the final shape once the server paginates.
