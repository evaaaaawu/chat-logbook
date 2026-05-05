import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { sessionsMeta } from "./schema.js";

export interface MetadataRepository {
  softDelete(sessionId: string): void;
  restore(sessionId: string): void;
  isDeleted(sessionId: string): boolean;
  listDeletedIds(): string[];
}

interface RepositoryOptions {
  dataDir: string;
}

export function createMetadataRepository({
  dataDir,
}: RepositoryOptions): MetadataRepository {
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "data.db"));
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions_meta (
      session_id TEXT PRIMARY KEY,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const db: BetterSQLite3Database = drizzle(sqlite);

  return {
    softDelete(sessionId) {
      const now = new Date();
      db.insert(sessionsMeta)
        .values({
          sessionId,
          isDeleted: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sessionsMeta.sessionId,
          set: { isDeleted: true, updatedAt: now },
        })
        .run();
    },

    restore(sessionId) {
      const now = new Date();
      db.update(sessionsMeta)
        .set({ isDeleted: false, updatedAt: now })
        .where(eq(sessionsMeta.sessionId, sessionId))
        .run();
    },

    isDeleted(sessionId) {
      const row = db
        .select({ isDeleted: sessionsMeta.isDeleted })
        .from(sessionsMeta)
        .where(eq(sessionsMeta.sessionId, sessionId))
        .get();
      return row?.isDeleted ?? false;
    },

    listDeletedIds() {
      const rows = db
        .select({ sessionId: sessionsMeta.sessionId })
        .from(sessionsMeta)
        .where(eq(sessionsMeta.isDeleted, true))
        .all();
      return rows.map((r) => r.sessionId);
    },
  };
}
