import { and, eq } from "drizzle-orm";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { openStore } from "../storage/openStore.js";
import * as schema from "./schema.js";
import { chatScanState } from "./schema.js";

export type CheckpointDb = BetterSQLite3Database<typeof schema>;

export interface ScanStat {
  mtimeMs: number;
  sizeBytes: number;
}

export interface ScanState {
  lastMtimeMs: number;
  lastSizeBytes: number;
  lastScannedAt: Date;
}

export interface CheckpointRepository {
  readonly db: CheckpointDb;
  getScanState(agent: string, sourceId: string): ScanState | undefined;
  recordScanState(
    agent: string,
    sourceId: string,
    sourcePath: string,
    stat: ScanStat,
    scannedAt: Date
  ): void;
  close(): void;
}

interface RepositoryOptions {
  dataDir: string;
}

export function createCheckpointRepository({
  dataDir,
}: RepositoryOptions): CheckpointRepository {
  const { db, sqlite } = openStore({
    dataDir,
    dbFile: "checkpoint.db",
    callerUrl: import.meta.url,
    migrationsSubdir: "drizzle/checkpoint",
    schema,
  });

  return {
    db,
    getScanState(agent, sourceId) {
      const row = db
        .select({
          lastMtimeMs: chatScanState.lastMtimeMs,
          lastSizeBytes: chatScanState.lastSizeBytes,
          lastScannedAt: chatScanState.lastScannedAt,
        })
        .from(chatScanState)
        .where(
          and(
            eq(chatScanState.agent, agent),
            eq(chatScanState.sourceId, sourceId)
          )
        )
        .get();
      return row ?? undefined;
    },
    recordScanState(agent, sourceId, sourcePath, stat, scannedAt) {
      const existing = db
        .select({ id: chatScanState.id })
        .from(chatScanState)
        .where(
          and(
            eq(chatScanState.agent, agent),
            eq(chatScanState.sourceId, sourceId)
          )
        )
        .get();

      if (existing) {
        db.update(chatScanState)
          .set({
            sourcePath,
            lastMtimeMs: stat.mtimeMs,
            lastSizeBytes: stat.sizeBytes,
            lastScannedAt: scannedAt,
          })
          .where(eq(chatScanState.id, existing.id))
          .run();
      } else {
        db.insert(chatScanState)
          .values({
            agent,
            sourceId,
            sourcePath,
            lastMtimeMs: stat.mtimeMs,
            lastSizeBytes: stat.sizeBytes,
            lastScannedAt: scannedAt,
          })
          .run();
      }
    },
    close() {
      sqlite.close();
    },
  };
}
