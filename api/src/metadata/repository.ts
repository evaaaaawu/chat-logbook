import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sessionsMeta } from "./schema.js";

function resolveMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "../../drizzle"),
    path.join(here, "./drizzle"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("Could not locate drizzle migrations folder");
  }
  return found;
}

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
  const db: BetterSQLite3Database = drizzle(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });

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
