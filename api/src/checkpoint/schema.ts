import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Per-Source-file scan watermark. Rebuildable operational state: it lets a Scan
// skip a Source file whose mtime and size are unchanged since the last scan.
// Lives in its own Checkpoint store (checkpoint.db), never backed up — see
// ADR-0014.
export const chatScanState = sqliteTable(
  "chat_scan_state",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent").notNull(),
    sourceId: text("source_id").notNull(),
    sourcePath: text("source_path").notNull(),
    lastMtimeMs: integer("last_mtime_ms").notNull(),
    lastSizeBytes: integer("last_size_bytes").notNull(),
    lastScannedAt: integer("last_scanned_at", {
      mode: "timestamp_ms",
    }).notNull(),
  },
  (t) => [uniqueIndex("chat_scan_state_idx").on(t.agent, t.sourceId)]
);
