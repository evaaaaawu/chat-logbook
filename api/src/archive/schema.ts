import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const archiveMeta = sqliteTable("archive_meta", {
  id: integer("id").primaryKey(),
  archiveUuid: text("archive_uuid").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const schemaVersion = sqliteTable("schema_version", {
  version: integer("version").primaryKey(),
  appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull(),
});

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull().unique(),
    agent: text("agent").notNull(),
    sourceId: text("source_id").notNull(),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    project: text("project"),
    projectPath: text("project_path"),
  },
  (t) => [uniqueIndex("chats_agent_source_idx").on(t.agent, t.sourceId)]
);

export const rawMessages = sqliteTable(
  "raw_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent").notNull(),
    sourceId: text("source_id").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceLocator: text("source_locator").notNull(),
    rawPayload: text("raw_payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    ingestedAt: integer("ingested_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("raw_messages_idem_idx").on(t.agent, t.sourceId, t.payloadHash),
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent").notNull(),
    sourceId: text("source_id").notNull(),
    messageId: text("message_id").notNull(),
    role: text("role").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    text: text("text").notNull(),
    blocks: text("blocks", { mode: "json" }).notNull(),
    rawId: integer("raw_id")
      .notNull()
      .references(() => rawMessages.id),
  },
  (t) => [
    uniqueIndex("messages_canonical_idx").on(t.agent, t.sourceId, t.messageId),
  ]
);

// The per-Source-file scan watermark formerly lived here as `session_scan_state`.
// It moved to its own Checkpoint store (checkpoint.db) — see ADR-0014 and
// api/src/checkpoint/. Archive migration 0007 drops the old table.

export const ingestionEvents = sqliteTable("ingestion_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agent: text("agent").notNull(),
  sourceId: text("source_id").notNull(),
  sourcePath: text("source_path").notNull(),
  eventType: text("event_type").notNull(),
  detail: text("detail", { mode: "json" }).notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
});
