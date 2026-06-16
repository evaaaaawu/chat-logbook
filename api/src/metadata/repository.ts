import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq, isNotNull } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { chatsMeta } from "./schema.js";

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

const DB_FILE = "metadata.db";
const LEGACY_DB_FILE = "data.db";

/**
 * Rename a pre-v0.9 `data.db` to `metadata.db` in place (ADR-0012).
 *
 * Same-filesystem rename is atomic and loses no data. If `metadata.db`
 * already exists we never clobber it — the stale `data.db` is left on disk
 * untouched, in keeping with "only an explicit user purge deletes data".
 */
function migrateLegacyDbFile(dataDir: string): void {
  const legacy = path.join(dataDir, LEGACY_DB_FILE);
  const current = path.join(dataDir, DB_FILE);
  if (!fs.existsSync(legacy)) return;
  if (fs.existsSync(current)) return;
  fs.renameSync(legacy, current);
}

export interface MetadataRepository {
  softDelete(internalId: string): void;
  restore(internalId: string): void;
  isDeleted(internalId: string): boolean;
  getDeletedAt(internalId: string): Date | null;
  listDeleted(): Array<{ id: string; deletedAt: Date | null }>;
  getCustomTitle(internalId: string): string | null;
  /** Every chat with a custom title, keyed by internal id. Lets read paths
   * resolve titles in one query instead of one per chat. */
  listCustomTitles(): Map<string, string>;
  setCustomTitle(internalId: string, title: string | null): void;
}

export type LookupInternalId = (
  agent: string,
  sourceId: string
) => string | null;

export type EnsureChat = (agent: string, sourceId: string) => string;

interface RepositoryOptions {
  dataDir: string;
  lookupInternalId?: LookupInternalId;
  ensureChat?: EnsureChat;
}

const CLAUDE_CODE_AGENT = "claude-code";

export function createMetadataRepository({
  dataDir,
  lookupInternalId,
  ensureChat,
}: RepositoryOptions): MetadataRepository {
  fs.mkdirSync(dataDir, { recursive: true });
  migrateLegacyDbFile(dataDir);
  const sqlite = new Database(path.join(dataDir, DB_FILE));
  const db: BetterSQLite3Database = drizzle(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });

  if (lookupInternalId) {
    rekeyLegacyRows(sqlite, db, lookupInternalId, ensureChat);
  }

  return {
    softDelete(internalId) {
      const now = new Date();
      db.insert(chatsMeta)
        .values({
          id: internalId,
          isDeleted: true,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        })
        .onConflictDoUpdate({
          target: chatsMeta.id,
          set: { isDeleted: true, updatedAt: now, deletedAt: now },
        })
        .run();
    },

    restore(internalId) {
      const now = new Date();
      db.update(chatsMeta)
        .set({ isDeleted: false, updatedAt: now, deletedAt: null })
        .where(eq(chatsMeta.id, internalId))
        .run();
    },

    isDeleted(internalId) {
      const row = db
        .select({ isDeleted: chatsMeta.isDeleted })
        .from(chatsMeta)
        .where(eq(chatsMeta.id, internalId))
        .get();
      return row?.isDeleted ?? false;
    },

    getDeletedAt(internalId) {
      const row = db
        .select({ deletedAt: chatsMeta.deletedAt })
        .from(chatsMeta)
        .where(eq(chatsMeta.id, internalId))
        .get();
      return row?.deletedAt ?? null;
    },

    listDeleted() {
      const rows = db
        .select({ id: chatsMeta.id, deletedAt: chatsMeta.deletedAt })
        .from(chatsMeta)
        .where(eq(chatsMeta.isDeleted, true))
        .all();
      return rows.map((r) => ({ id: r.id, deletedAt: r.deletedAt ?? null }));
    },

    getCustomTitle(internalId) {
      const row = db
        .select({ customTitle: chatsMeta.customTitle })
        .from(chatsMeta)
        .where(eq(chatsMeta.id, internalId))
        .get();
      return row?.customTitle ?? null;
    },

    listCustomTitles() {
      const rows = db
        .select({ id: chatsMeta.id, customTitle: chatsMeta.customTitle })
        .from(chatsMeta)
        .where(isNotNull(chatsMeta.customTitle))
        .all();
      const byId = new Map<string, string>();
      for (const row of rows) {
        if (row.customTitle !== null) byId.set(row.id, row.customTitle);
      }
      return byId;
    },

    setCustomTitle(internalId, title) {
      const now = new Date();
      db.insert(chatsMeta)
        .values({
          id: internalId,
          customTitle: title,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: chatsMeta.id,
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
  ensureChat: EnsureChat | undefined
): void {
  const current = sqlite.pragma("user_version", { simple: true }) as number;
  if (current >= REKEY_USER_VERSION) return;

  const rows = db.select({ id: chatsMeta.id }).from(chatsMeta).all();
  for (const row of rows) {
    let target = lookupInternalId(CLAUDE_CODE_AGENT, row.id);
    if (target === null) {
      if (!ensureChat) continue;
      target = ensureChat(CLAUDE_CODE_AGENT, row.id);
    }
    if (target === row.id) continue;
    db.update(chatsMeta)
      .set({ id: target, updatedAt: new Date() })
      .where(eq(chatsMeta.id, row.id))
      .run();
  }

  sqlite.pragma(`user_version = ${REKEY_USER_VERSION}`);
}
