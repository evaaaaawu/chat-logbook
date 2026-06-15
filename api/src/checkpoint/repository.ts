import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
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

function resolveMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "../../drizzle/checkpoint"),
    path.join(here, "./drizzle/checkpoint"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("Could not locate checkpoint drizzle migrations folder");
  }
  return found;
}

export function createCheckpointRepository({
  dataDir,
}: RepositoryOptions): CheckpointRepository {
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "checkpoint.db"));
  const db: CheckpointDb = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });

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
