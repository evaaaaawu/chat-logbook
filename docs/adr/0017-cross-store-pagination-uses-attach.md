# Cross-store paginated listing runs one ATTACH query

Server-side sorted, keyset-paginated Chat listing — filtered across the Archive store (`chats.project`, OR/union) and the Metadata store (`chat_tags`, AND/intersection) — runs as a single SQL pass on the Archive connection with the Metadata DB `ATTACH`ed, rather than the app-level intersection of per-store id sets that [ADR-0016](0016-combined-filtering-app-level-intersection.md) established for the full-list model. ADR-0016 deferred this choice to "the later list-pipeline refactor, where server-side sort + pagination actually needs it"; this is that point, and this ADR resolves the deferral.

The deciding factor is that app-level intersection cannot push the page `LIMIT` into SQL. It must load every candidate id from each store, intersect, sort, then slice in application code — so its cost scales with the size of the filtered candidate set and is independent of page depth. `ATTACH` does intersection + `ORDER BY` + keyset `LIMIT` in one pass, so with the right index it is an index range scan that stops after one page.

## Benchmark

Spike code: `api/src/spike/cross-store-pagination.ts` (both strategies behind one interface, proven to return identical pages by `cross-store-pagination.test.ts`) and `api/scripts/bench-cross-store-pagination.ts`. Measured on a seeded Archive of 50,000 Chats (50 Projects, 30% tagged, 10-Tag pool), page size 50, median of 50 runs.

With the supporting indexes below in place:

| Query (page size 50)     | ATTACH | App-level | App-level / ATTACH |
| ------------------------ | ------ | --------- | ------------------ |
| Unfiltered, first page   | 0.02ms | 6.47ms    | ~390x              |
| Unfiltered, deep page    | 0.93ms | 6.67ms    | ~7x                |
| One Project (~1.7k rows) | 0.52ms | 1.40ms    | ~3x                |
| Tag AND (two Tags)       | 1.78ms | 10.03ms   | ~6x                |
| Untagged group           | 0.03ms | 25.28ms   | ~800x              |
| Project + Tag combined   | 2.00ms | 2.55ms    | ~1.3x              |

The unfiltered list — the default view, and the largest candidate set — is where the gap is widest and most structural: app-level holds a ~6.5ms floor (materializing and sorting 50k rows in JS) that does not shrink with page size, while ATTACH stays bounded by the page. When a Project filter already narrows the set the two converge, but the common case is the one that matters, and ATTACH never loses.

## Considered options

- **App-level intersection (ADR-0016), extended with sort + keyset.** Preserves the four-store isolation of [ADR-0001](0001-four-store-split.md) — no connection ever sees another store's tables. Rejected for the paginated path: it cannot push `LIMIT` down, so the default unfiltered list pays a candidate-set-sized cost on every page. Still the right shape for the full-list model it was written for.
- **`ATTACH` single cross-database query.** One pass, page-bounded latency. Relaxes ADR-0001 isolation: the Archive connection must hold a path to `metadata.db` and reference `meta.chat_tags`. Chosen — the isolation it relaxes is read-only and one-directional (Archive reads Metadata; no writes cross, no schema merges), and the latency win on the common path is large and structural.

## Consequences

- **Isolation is relaxed, narrowly.** The read path `ATTACH`es `metadata.db` onto the Archive connection read-only and references `meta.chat_tags` in `SELECT`s only. No writes cross stores, schemas are not merged, and the four `.db` files stay physically separate — so [ADR-0001](0001-four-store-split.md), [ADR-0002](0002-never-cascade-delete-archive.md), and the backup model are untouched. The pagination module owns the `ATTACH` and detaches/closes on teardown; ingestion and the write seams never `ATTACH`.
- **Required indexes.** `chats(first_seen_at DESC, id DESC)` — a covering keyset index so the sort + `LIMIT` is an index range scan, not a full sort (this is what takes the unfiltered first page from ~1.3ms to ~0.02ms). `chat_tags(chat_id)` on the Metadata side for the Tag subquery (the existing `chat_tags` PK is `(chat_id, tag_id)`, which already leads with `chat_id`, so a separate index may be redundant — confirm with `EXPLAIN QUERY PLAN` before adding). The existing `chats_project_idx` covers the Project filter.
- **Query shape** the pagination slice implements against:
  ```sql
  SELECT c.id, c.first_seen_at AS sort_key
  FROM chats c
  WHERE 1=1
    -- Project filter (optional, OR): coalesce folds NULL and '' into (No project)
    [ AND coalesce(c.project, '') IN (?, ...) ]
    -- Tag filter (optional, AND): every selected real Tag must be held
    [ AND c.id IN (SELECT chat_id FROM meta.chat_tags WHERE tag_id IN (?, ...)
                   GROUP BY chat_id HAVING count(*) = ?) ]
    -- Untagged group ('' marker): ANDs with the above, so real + '' yields nothing
    [ AND c.id NOT IN (SELECT chat_id FROM meta.chat_tags) ]
    -- Keyset cursor (optional): strictly after the last row of the previous page
    [ AND (c.first_seen_at < ? OR (c.first_seen_at = ? AND c.id < ?)) ]
  ORDER BY c.first_seen_at DESC, c.id DESC
  LIMIT ? + 1;  -- one extra row signals whether a next page exists
  ```
- **Cursor design.** The keyset cursor is `(first_seen_at, id)` — the sort key plus the internal `chats.id` as a stable, unique tiebreaker — opaque to clients (encode as an opaque token, not the raw pair). It is page-bounded and stateless: no `OFFSET`, so deep pages cost the same as the first. Fetching `LIMIT + 1` rows yields the next cursor without a separate count.
- **Sort key is `first_seen_at` (createdAt), not derived `updatedAt`.** The benchmark sorts on `chats.first_seen_at`, a real indexable column, to isolate the cross-store cost. Sorting by "most recent activity" (`max(messages.ts)`) is the likely product default and is **not** covered here: it needs either a denormalized `updated_at` column on `chats` (kept current at ingest) or an aggregate that defeats the keyset index. Decide that separately before the list UI commits to an activity sort — the `ATTACH` shape above carries over, only the sort column and its index change.
- **The spike code is throwaway.** `api/src/spike/` and the bench script document the decision; the chosen shape graduates into the real pagination module in the implementing slice. Delete the spike once that lands.
