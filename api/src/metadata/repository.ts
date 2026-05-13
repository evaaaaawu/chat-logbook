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
  softDelete(internalId: string): void;
  restore(internalId: string): void;
  isDeleted(internalId: string): boolean;
  listDeletedIds(): string[];
  getCustomTitle(internalId: string): string | null;
  setCustomTitle(internalId: string, title: string | null): void;
}

export type LookupInternalId = (
  agent: string,
  sourceSessionId: string
) => string | null;

export type EnsureSession = (agent: string, sourceSessionId: string) => string;

interface RepositoryOptions {
  dataDir: string;
  lookupInternalId?: LookupInternalId;
  ensureSession?: EnsureSession;
}

const CLAUDE_CODE_AGENT = "claude-code";

export function createMetadataRepository({
  dataDir,
  lookupInternalId,
  ensureSession,
}: RepositoryOptions): MetadataRepository {
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "data.db"));
  const db: BetterSQLite3Database = drizzle(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });

  if (lookupInternalId) {
    rekeyLegacyRows(sqlite, db, lookupInternalId, ensureSession);
  }

  return {
    softDelete(internalId) {
      const now = new Date();
      db.insert(sessionsMeta)
        .values({
          id: internalId,
          isDeleted: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sessionsMeta.id,
          set: { isDeleted: true, updatedAt: now },
        })
        .run();
    },

    restore(internalId) {
      const now = new Date();
      db.update(sessionsMeta)
        .set({ isDeleted: false, updatedAt: now })
        .where(eq(sessionsMeta.id, internalId))
        .run();
    },

    isDeleted(internalId) {
      const row = db
        .select({ isDeleted: sessionsMeta.isDeleted })
        .from(sessionsMeta)
        .where(eq(sessionsMeta.id, internalId))
        .get();
      return row?.isDeleted ?? false;
    },

    listDeletedIds() {
      const rows = db
        .select({ id: sessionsMeta.id })
        .from(sessionsMeta)
        .where(eq(sessionsMeta.isDeleted, true))
        .all();
      return rows.map((r) => r.id);
    },

    getCustomTitle(internalId) {
      const row = db
        .select({ customTitle: sessionsMeta.customTitle })
        .from(sessionsMeta)
        .where(eq(sessionsMeta.id, internalId))
        .get();
      return row?.customTitle ?? null;
    },

    setCustomTitle(internalId, title) {
      const now = new Date();
      db.insert(sessionsMeta)
        .values({
          id: internalId,
          customTitle: title,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sessionsMeta.id,
          set: { customTitle: title, updatedAt: now },
        })
        .run();
    },
  };
}

const REKEY_USER_VERSION = 4;

function rekeyLegacyRows(
  sqlite: Database.Database,
  db: BetterSQLite3Database,
  lookupInternalId: LookupInternalId,
  ensureSession: EnsureSession | undefined
): void {
  const current = sqlite.pragma("user_version", { simple: true }) as number;
  if (current >= REKEY_USER_VERSION) return;

  const rows = db.select({ id: sessionsMeta.id }).from(sessionsMeta).all();
  for (const row of rows) {
    let target = lookupInternalId(CLAUDE_CODE_AGENT, row.id);
    if (target === null) {
      if (!ensureSession) continue;
      target = ensureSession(CLAUDE_CODE_AGENT, row.id);
    }
    if (target === row.id) continue;
    db.update(sessionsMeta)
      .set({ id: target, updatedAt: new Date() })
      .where(eq(sessionsMeta.id, row.id))
      .run();
  }

  sqlite.pragma(`user_version = ${REKEY_USER_VERSION}`);
}
