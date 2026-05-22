import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
