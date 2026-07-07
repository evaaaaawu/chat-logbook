import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { openStore } from "../storage/openStore.js";
import * as schema from "./schema.js";
import { chatsMeta, chatSortKeys } from "./schema.js";
import { computeSortKey } from "./title-sort-key.js";

export type MetadataDb = BetterSQLite3Database<typeof schema>;

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
  /**
   * Trash every id in one transaction (batch Move to Trash, #161). Mirrors
   * `softDelete`'s upsert per row so an id with no prior metadata row still gets
   * one, and stamps a single `deletedAt` across the set. Empty input is a no-op.
   */
  softDeleteBatch(internalIds: string[]): void;
  /** Restore every id in one transaction — the inverse of `softDeleteBatch`. */
  restoreBatch(internalIds: string[]): void;
  isDeleted(internalId: string): boolean;
  getDeletedAt(internalId: string): Date | null;
  listDeleted(): Array<{ id: string; deletedAt: Date | null }>;
  getCustomTitle(internalId: string): string | null;
  /** Every chat with a custom title, keyed by internal id. Lets read paths
   * resolve titles in one query instead of one per chat. */
  listCustomTitles(): Map<string, string>;
  setCustomTitle(internalId: string, title: string | null): void;
  /**
   * The denormalized Title sort key for a chat (ADR-0019), or null when no row
   * exists yet. `textKey` is the first-user-text fallback key; `sortKey` is the
   * effective, indexed key the Title axis orders by.
   */
  getTitleSortKey(
    internalId: string
  ): { textKey: string | null; sortKey: string | null } | null;
  /**
   * Record a chat's `text_key` (the first-user-text fallback key), written by
   * ingest/reconcile. `sort_key` is refreshed to track it only when the chat has
   * no custom title; a custom-title override keeps its own key, so re-ingesting
   * never clobbers a user's rename (ADR-0019). Upserts the row so every chat
   * ends up with one — the invariant the Title INNER JOIN depends on.
   */
  setTitleTextKey(internalId: string, textKey: string): void;
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
  // Rename a pre-v0.9 data.db before opening (ADR-0012). openStore has no
  // beforeOpen hook; the rename is a no-op when dataDir doesn't exist yet, so
  // plain ordering here is enough.
  migrateLegacyDbFile(dataDir);
  const { db, sqlite } = openStore({
    dataDir,
    dbFile: DB_FILE,
    callerUrl: import.meta.url,
    migrationsSubdir: "drizzle",
    schema,
  });

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

    softDeleteBatch(internalIds) {
      if (internalIds.length === 0) return;
      const now = new Date();
      db.transaction((tx) => {
        for (const id of internalIds) {
          tx.insert(chatsMeta)
            .values({
              id,
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
        }
      });
    },

    restoreBatch(internalIds) {
      if (internalIds.length === 0) return;
      const now = new Date();
      db.transaction((tx) => {
        tx.update(chatsMeta)
          .set({ isDeleted: false, updatedAt: now, deletedAt: null })
          .where(inArray(chatsMeta.id, internalIds))
          .run();
      });
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

      // Keep the Title sort key in step (ADR-0019). Setting a custom title
      // overrides `sort_key` with the title's key; clearing it copies the
      // persisted `text_key` back, so the chat re-sorts under its first-user-text
      // fallback in O(1) without re-scanning messages.
      if (title !== null) {
        const sortKey = computeSortKey(title);
        db.insert(chatSortKeys)
          .values({ id: internalId, sortKey })
          .onConflictDoUpdate({ target: chatSortKeys.id, set: { sortKey } })
          .run();
      } else {
        // Copy text_key → sort_key in place. When no row exists yet there is no
        // text_key to fall back to; reconcile will create it, so do nothing.
        db.update(chatSortKeys)
          .set({ sortKey: sql`${chatSortKeys.textKey}` })
          .where(eq(chatSortKeys.id, internalId))
          .run();
      }
    },

    getTitleSortKey(internalId) {
      const row = db
        .select({
          textKey: chatSortKeys.textKey,
          sortKey: chatSortKeys.sortKey,
        })
        .from(chatSortKeys)
        .where(eq(chatSortKeys.id, internalId))
        .get();
      return row ?? null;
    },

    setTitleTextKey(internalId, textKey) {
      // A custom title overrides the effective key; only the no-custom-title case
      // tracks text_key. Reading the override here keeps both the insert and the
      // update paths consistent without a CASE expression spanning two tables.
      const customTitle = db
        .select({ customTitle: chatsMeta.customTitle })
        .from(chatsMeta)
        .where(eq(chatsMeta.id, internalId))
        .get()?.customTitle;
      const sortKey =
        customTitle && customTitle.trim()
          ? computeSortKey(customTitle)
          : textKey;
      db.insert(chatSortKeys)
        .values({ id: internalId, textKey, sortKey })
        .onConflictDoUpdate({
          target: chatSortKeys.id,
          set: { textKey, sortKey },
        })
        .run();
    },
  };
}

const REKEY_USER_VERSION = 4;

function rekeyLegacyRows(
  sqlite: Database.Database,
  db: MetadataDb,
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
