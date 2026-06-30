# The cross-store Title sort key is an app-computed collation key in Metadata

Title goes full keyset like every other axis ([ADR-0018](0018-single-keyset-read-path.md)), so the
list needs a single indexable column to `ORDER BY`. But the effective Title spans two stores — a
custom title in Metadata overrides the first user message's first line derived from the Archive,
falling back to `"Untitled"` (`deriveTitle`, `api/src/chat-reader.ts`). SQLite has no native locale
collation and `better-sqlite3` exposes no custom-collation API (only `function` / `aggregate` /
`loadExtension`), and a scalar function in `ORDER BY` defeats the index range scan
[ADR-0017](0017-cross-store-pagination-uses-attach.md) depends on. So we precompute a
BINARY-collatable sort key and store it in a dedicated `chat_sort_keys` table in **metadata.db**,
maintained across both write paths, and keyset on it through the same `ATTACH` join the `deletedAt`
axis already uses.

## Decisions

### Collation-key mechanism: app-computed, hand-rolled, not ICU

The issue's recommended "app-computed ICU sort key" has no off-the-shelf path on this stack: Node's
`Intl.Collator` exposes only `compare()`, not a stable sort key (no `ucol_getSortKey` equivalent).
Producing a real ICU key would mean a compiled native module across macOS/Windows/Linux — the same
distribution burden that rejected the SQLite ICU extension (issue option (b)) for a local-first app
whose entire `api` depends on `better-sqlite3` and `update-notifier` and nothing else.

So the key is a **hand-rolled deterministic key** (issue option (c)), built in Node and stored as
TEXT compared with BINARY collation:

- **Case- and accent-insensitive** — NFKD normalize, strip combining marks, casefold. Matches
  today's `sensitivity: "base"`.
- **Numeric ordering kept** — digit runs are re-encoded (length-prefixed) so `"2" < "10"` under
  BINARY compare. Matches today's `numeric: true`. This is the costliest part of the encoding and
  the one place the key isn't just the normalized string.
- **CJK ordering drifts, deliberately.** UTF-8 byte order equals Unicode code-point order, so the
  non-numeric key needs no custom encoding — but code-point order is **not** the `zh-Hant`
  stroke/pinyin order today's `localeCompare("zh-Hant", …)` produces. Replicating that needs ICU,
  which we just rejected. Accepted: Traditional-Chinese titles sort by code point, not by
  pronunciation/stroke.

### `"Untitled"` is an ordinary title, not a bidirectional sink

The issue describes "empty/Untitled sinking to the bottom," but the live app does not do that.
`deriveTitle` floors every effective Title at the literal string `"Untitled"`, so the wire title is
never empty and the client's `isEmptyTitle` sink (`web/src/chat/sort/sortChats.ts`) never fires for
real data — `"Untitled"` simply sorts as the letter U (bottom in A-Z, top in Z-A). A true
bidirectional sink can't be expressed by one monotonic key under a flipping `ORDER BY`; it would
need a non-flipping `is_empty` primary sort column, widening the cursor and index — complexity for a
behavior users don't currently have. So `"Untitled"` keys as the ordinary string `"untitled"`. This
matches the live app and diverges only from the issue's inaccurate prose.

### Storage and maintenance: `chat_sort_keys` in metadata.db, two columns

`chat_sort_keys(id, text_key, sort_key)`, keyed by the internal chat `id` (UUID), one row per chat:

- `text_key` — `collation(first_user_text else "Untitled")`. Written by **ingest only**. Persisted
  so clearing a custom title can fall back in O(1) without re-scanning messages.
- `sort_key` — the effective key, indexed. Written by both paths.

Each path holds only half the input, so this two-column split lets neither reach across stores to
re-derive the other half:

- **Ingest** computes `text_key`; sets `sort_key = text_key` when the chat has no custom title,
  leaves `sort_key` untouched when it does.
- **Set custom title** sets `sort_key = collation(custom_title)` directly.
- **Clear custom title** copies `sort_key = text_key`.

### Cursor and index shape for the Title axis

- Covering index `chat_sort_keys(sort_key, id)` with BINARY collation in metadata.db; read via
  `chats c JOIN meta.chat_sort_keys k ON k.id = c.id` (INNER — every chat has a row), with
  `SORT_EXPR["title"] = "k.sort_key"`. `ORDER BY k.sort_key, k.id` is an index range scan that
  scans either direction, exactly like the time axes (`api/src/list-pagination.ts`).
- The keyset cursor keeps its `(sortKey, id)` shape and the `chats.id` tiebreaker, but
  `KeysetCursor.sortKey` widens from `number` to `number | string` — the Title axis carries the
  string key, the time axes carry epoch-ms numbers. The opaque base64url(JSON) token is unchanged.

## Consequences

- **Ingest now writes metadata.db.** A new, narrow coupling: ingest writes a derived, rebuildable
  key row into the otherwise user-owned Metadata store. This is the inverse direction from
  ADR-0017's read-only `ATTACH`, and it is the cost we accept to (a) keep the app-internal collation
  blob out of the Archive, which is a public export format that forbids app-internal columns (see
  `docs/ARCHITECTURE.md` archive contract), and (b) avoid standing up the not-yet-built `index.db`
  store just to sort by name.
- **metadata.db is now always present after first ingest.** It was created lazily on the first user
  action (tag/trash); the Title key write forces ingest to create `metadata.db` +`chat_sort_keys`
  even when nothing was ever tagged. The read path's "no metadata = empty" fast paths still hold for
  the tag/trash predicates.
- **`chat_sort_keys` is derived and rebuildable.** Losing it costs a recompute, never data. A
  collation-rule change (e.g. revisiting the numeric encoding or the CJK decision) is "recompute the
  table," not a data migration.
- **Consistency is reconcile-based, not transactional.** archive.db and metadata.db share no
  transaction, so a crash mid-ingest can leave a chat without a key row — and the INNER JOIN would
  hide it from the Title list. A `LEFT JOIN + COALESCE(sort_key, …)` would restore it but break the
  index range scan, so instead we hold the invariant "every chat has a row" with a startup reconcile
  that backfills missing rows (this also serves the one-time initial backfill). The crash window can
  briefly drop a brand-new chat from Title sort until the next reconcile; acceptable, since other
  axes still show it.
- **Implemented by [#146](https://github.com/evaaaaawu/chat-logbook/issues/146).** This slice is the
  decision only; #146 builds the table, the key function, the ingest/rename maintenance, the
  reconcile, and the `list-pagination.ts` Title axis against it.

## Considered options

- **Native ICU sort-key module / SQLite ICU extension.** Exact fidelity to today's order, including
  `zh-Hant`. Rejected: a compiled native dependency across three platforms is a real distribution
  burden for a local-first app — the same reason issue option (b) was rejected.
- **Key column in the Archive (`chats.title_sort_key`).** Rejected: a custom-title change would have
  to write the Archive (reverse of ADR-0017's one-directional read), and an app-internal collation
  blob violates the Archive's public-export-format contract.
- **Two key columns coalesced at query time (`ORDER BY coalesce(custom_key, archive_key)`).**
  Rejected: a coalesce across the two ATTACH'd stores can't use an index, so every page pays a full
  sort — the cost ADR-0017 exists to remove.
- **Key in a new `index.db` store.** Conceptually the cleanest home for derived, rebuildable data.
  Rejected for this slice: `index.db` is planned but unbuilt, and standing it up (plus a third
  `ATTACH`) is scope #146 should not carry.
