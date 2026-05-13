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

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    shortCode: text("short_code").notNull().unique(),
    agent: text("agent").notNull(),
    sourceSessionId: text("source_session_id").notNull(),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    project: text("project"),
  },
  (t) => [
    uniqueIndex("sessions_agent_source_idx").on(t.agent, t.sourceSessionId),
  ]
);

export const rawMessages = sqliteTable(
  "raw_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent").notNull(),
    sessionId: text("session_id").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceLocator: text("source_locator").notNull(),
    rawPayload: text("raw_payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    ingestedAt: integer("ingested_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("raw_messages_idem_idx").on(
      t.agent,
      t.sessionId,
      t.payloadHash
    ),
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent").notNull(),
    sessionId: text("session_id").notNull(),
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
    uniqueIndex("messages_canonical_idx").on(t.agent, t.sessionId, t.messageId),
  ]
);

export const sessionScanState = sqliteTable(
  "session_scan_state",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent").notNull(),
    sessionId: text("session_id").notNull(),
    sourcePath: text("source_path").notNull(),
    lastMtimeMs: integer("last_mtime_ms").notNull(),
    lastSizeBytes: integer("last_size_bytes").notNull(),
    lastScannedAt: integer("last_scanned_at", {
      mode: "timestamp_ms",
    }).notNull(),
  },
  (t) => [uniqueIndex("session_scan_state_idx").on(t.agent, t.sessionId)]
);

export const ingestionEvents = sqliteTable("ingestion_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agent: text("agent").notNull(),
  sessionId: text("session_id").notNull(),
  sourcePath: text("source_path").notNull(),
  eventType: text("event_type").notNull(),
  detail: text("detail", { mode: "json" }).notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
});
