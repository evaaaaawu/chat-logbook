import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessionsMeta = sqliteTable("sessions_meta", {
  sessionId: text("session_id").primaryKey(),
  isDeleted: integer("is_deleted", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
