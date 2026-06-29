import {
  index,
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
    // Denormalized "conversation start" = min(messages.ts), kept current at
    // ingest and backfilled in migration 0010. The createdAt sort pages by this
    // (not first_seen_at, the ingest time) so the paged order matches the
    // reader's displayed createdAt (issue #143, reconciling ADR-0017's caveat).
    // Initialized to first_seen_at for a chat with no messages; since
    // first_seen_at is the ingest time and so >= every message ts, the running
    // min over (first_seen_at, message ts) equals min(messages.ts) once any
    // message exists, and first_seen_at when none — never NULL.
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    // Denormalized "most recent activity" = max(messages.ts), kept current at
    // ingest and backfilled in migration 0009. Lets the activity sort run as a
    // keyset index range scan instead of an aggregate that defeats the index
    // (ADR-0017). Initialized to first_seen_at for a chat with no messages, so
    // it is never NULL and always agrees with the reader's derived `updatedAt`.
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    project: text("project"),
    projectPath: text("project_path"),
  },
  (t) => [
    uniqueIndex("chats_agent_source_idx").on(t.agent, t.sourceId),
    // Backs the server-side Project filter (`WHERE coalesce(project,'') IN …`).
    index("chats_project_idx").on(t.project),
    // Covering keyset indexes for the two server-side list sorts (ADR-0017):
    // (sortKey, id) so the ORDER BY + LIMIT is an index range scan either way.
    index("chats_created_keyset_idx").on(t.createdAt, t.id),
    index("chats_updated_keyset_idx").on(t.updatedAt, t.id),
  ]
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
