import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const chatsMeta = sqliteTable(
  "chats_meta",
  {
    id: text("id").primaryKey(),
    isDeleted: integer("is_deleted", { mode: "boolean" })
      .notNull()
      .default(false),
    customTitle: text("custom_title"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    // Set when a chat is moved to Trash; null while active. Drives the Trash
    // view's independent "Deleted time" sort axis.
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    // Covering keyset index for the Trash view's deleted-time axis (#145,
    // ADR-0017): `(deleted_at, id)` so the page's ORDER BY + LIMIT is an index
    // range scan, not a full-trash sort. Partial on `deleted_at IS NOT NULL`,
    // which holds exactly for trashed rows (restore nulls it), so the index
    // carries only the Trash set and the page query's matching predicate lets
    // the planner use it.
    index("chats_meta_deleted_at_idx")
      .on(table.deletedAt, table.id)
      .where(sql`${table.deletedAt} is not null`),
  ]
);

// The denormalized cross-store Title sort key (ADR-0019), keyed by the internal
// chat `id` (UUID), one row per chat. `text_key` is collation(first-user-text
// else "Untitled"), written by ingest/reconcile and persisted so clearing a
// custom title falls back in O(1). `sort_key` is the effective, indexed key —
// it equals `text_key` until a custom title overrides it. Both are TEXT compared
// under SQLite's default BINARY collation; the app precomputes the locale-aware
// ordering into the bytes (no native ICU). Derived and rebuildable: losing the
// table costs a recompute, never data.
export const chatSortKeys = sqliteTable(
  "chat_sort_keys",
  {
    id: text("id").primaryKey(),
    textKey: text("text_key"),
    sortKey: text("sort_key"),
  },
  (table) => [
    // Covering keyset index for the Title axis (ADR-0017/0019): `(sort_key, id)`
    // so `ORDER BY sort_key, id` + LIMIT is an index range scan either
    // direction, exactly like the time axes — never a full-table sort.
    index("chat_sort_keys_sort_key_idx").on(table.sortKey, table.id),
  ]
);

// A user-defined Tag. `color` holds a semantic palette token (e.g. "violet"),
// never a raw hex — rendering resolves token→hex through one shared map
// (ADR-0015). Reusing a color across Tags is allowed.
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Many-to-many join between Chats and Tags. PK `(chat_id, tag_id)` keys the
// pair; the secondary index on `(tag_id)` serves the AND-intersection Tag
// filter (#11 / ADR-0016).
export const chatTags = sqliteTable(
  "chat_tags",
  {
    chatId: text("chat_id").notNull(),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.tagId] }),
    index("chat_tags_tag_id_idx").on(table.tagId),
  ]
);
