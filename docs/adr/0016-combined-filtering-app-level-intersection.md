# Combined filtering intersects per-store id sets in app code

Combined Project + Tag + search filtering computes a candidate Chat id set per store using each store's own indexed query — Tags (AND intersection) from `metadata.db`, Projects (OR union) from the Archive's `chats` table, search hits from the Index — and intersects those sets in application code (the ChatReader), rather than issuing a single cross-database SQL JOIN. This preserves the four-store isolation of [ADR-0001](0001-four-store-split.md) and follows the read-time composition the ChatReader already does keyed by `(agent, source_id)`.

## Consequences

- Each store keeps its own indexes: `chat_tags` with PK `(chat_id, tag_id)` plus a secondary index on `(tag_id)`; the Archive's `chats.project` gets an index. Tag display batches one grouped query into a `Map`, never one query per Chat.
- The `ATTACH`-based single-query approach (one SQL pass doing intersection + `ORDER BY` + keyset pagination across stores) is deferred to the later list-pipeline refactor, where server-side sort + pagination actually needs it. That is the point to revisit this decision and weigh `ATTACH` against the ADR-0001 isolation it would relax. **Resolved by [ADR-0017](0017-cross-store-pagination-uses-attach.md):** the paginated path uses `ATTACH`; this app-level intersection stays the shape for the full-list model.
- Trade-off: app-side intersection is fine while the frontend loads the full filtered list (the current model), but is not the final shape once the server paginates.

## Update: the Tag axis gains an Any (OR) mode

The Tag filter is no longer AND-only. A per-view `tagMode` (`all` | `any`, default `all`) chooses how the selected real Tags combine: `all` keeps the AND intersection this ADR established (a Chat must hold every selected Tag); `any` keeps a Chat that holds **at least one** selected Tag. The mode governs only how Tags combine _with each other_ — the Project axis stays an OR/union, and the cross-axis relation (Project filter AND Tag filter) is unchanged. Facet counts are unaffected: they count each Tag's universe in the view and never move with the selection or the mode; only the List count and the paged result depend on `tagMode`.

The reason is a real product need — "Chats tagged `bug` **or** `regression`" is as common a question as "tagged both" — and the AND-only default, while the right primary, cannot express it. Adding a mode rather than switching wholesale keeps AND the default and the OR path opt-in.

- **Query shape.** In the shared predicate ([`list-filter.ts`](../../api/src/list-filter.ts), the `ATTACH` keyset path of [ADR-0017](0017-cross-store-pagination-uses-attach.md)), `all` keeps `... WHERE tag_id IN (?, ...) GROUP BY chat_id HAVING count(*) = ?`; `any` drops the `HAVING` and matches `c.id IN (SELECT DISTINCT chat_id FROM meta.chat_tags WHERE tag_id IN (?, ...))`. Both stay index range scans on `chat_tags`.
- **`Untagged` joins the union in `any` mode.** In `all` mode the `Untagged` marker (`''`) and a real Tag AND to nothing — they are mutually exclusive, so the UI dims real Tags while `Untagged` is active. In `any` mode "holds no Tags **or** holds Tag X" is a meaningful union, so `Untagged` is ORed in alongside the real-Tag clause (`OR`, not `AND`) and the dimming is dropped. This is the one place `tagMode` changes how the `''` marker composes, and it is surprising without this note.
- **Mode is persisted** per view like the sort preference, so a chosen `any` survives reloads.
