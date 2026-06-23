import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const chatsMeta = sqliteTable("chats_meta", {
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
});

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
