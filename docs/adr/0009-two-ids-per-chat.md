# Give each Chat an internal UUID and a user-facing Crockford chat_id

Each Chat has two ids: an internal **UUID** primary key (never shown to users) and a short user-facing **`chat_id`** — 6 Crockford base-32 characters, shown as `clog_a3f7kx`.

## Considered and rejected

- **Expose the vendor UUID** — unmemorable, and couples our identity to the vendor's.
- **Use the short id as the primary key** — the short id must stay regenerable for a future sync-collision path, so it cannot be the stable PK; the internal UUID also gives a stable identity across vendor source-id collisions.
- **Sequential `clog_42`** — two machines would assign the same number and collide on sync.
- **Word-slug like `brave-otter-42`** — dictionary dependency, awkward for non-English users and harder to lay out in the UI.

Crockford base-32 drops `i l o u` so the id is unambiguous to type, and 6 characters give ~10⁹ combinations — collision-free for a personal archive, with a small retry cap as insurance. The `clog_` prefix lets an Agent pattern-match `clog_[0-9a-z]{6}` without colliding with commit hashes, tokens, or other ids.
