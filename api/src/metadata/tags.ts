import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { openStore } from "../storage/openStore.js";
import * as schema from "./schema.js";
import { chatTags, tags } from "./schema.js";
import { type ColorToken, isColorToken } from "./tag-colors.js";

const DB_FILE = "metadata.db";

export interface Tag {
  id: string;
  name: string;
  color: ColorToken;
}

export interface TagRepository {
  createTag(name: string, color: ColorToken): Tag;
  listTags(): Tag[];
  getTag(id: string): Tag | null;
  renameTag(id: string, name: string): void;
  recolorTag(id: string, color: ColorToken): void;
  /** Delete a Tag and every Chat association it had. Returns how many Chats it
   * was removed from, for the confirmation copy ("removed from N Chats"). */
  deleteTag(id: string): { removedFromChats: number };
  /** Assign a Tag to a Chat. Re-assigning the same pair is an idempotent no-op
   * (the `(chat_id, tag_id)` primary key absorbs the conflict). */
  assignTag(chatId: string, tagId: string): void;
  removeTag(chatId: string, tagId: string): void;
  listTagsForChat(chatId: string): Tag[];
  /** Tags grouped by Chat id in one query — never one query per Chat
   * (ADR-0016). Pass `chatIds` to scope to a subset; omit for every Chat. */
  listTagsByChat(chatIds?: string[]): Map<string, Tag[]>;
  /**
   * Chat ids holding ALL of the given Tags — the AND-intersection that backs
   * the multi-Tag filter (#11 / ADR-0016). `tag_id IN (...) GROUP BY chat_id
   * HAVING COUNT = N`; the `(chat_id, tag_id)` PK guarantees no duplicate rows
   * so the count is exact. Duplicate ids in the input are de-duplicated first
   * so a repeated id can't inflate N past what any Chat can match. An empty
   * input returns no ids (an AND over nothing has no candidate set here). */
  listChatIdsWithAllTags(tagIds: string[]): string[];
}

interface TagRepositoryOptions {
  dataDir: string;
}

export function createTagRepository({
  dataDir,
}: TagRepositoryOptions): TagRepository {
  const { db } = openStore({
    dataDir,
    dbFile: DB_FILE,
    callerUrl: import.meta.url,
    migrationsSubdir: "drizzle",
    schema,
  });

  function toTag(row: { id: string; name: string; color: string }): Tag {
    return { id: row.id, name: row.name, color: row.color as ColorToken };
  }

  function assertColor(color: ColorToken): void {
    if (!isColorToken(color)) {
      throw new Error(`Invalid tag color token: ${String(color)}`);
    }
  }

  return {
    createTag(name, color) {
      assertColor(color);
      const now = new Date();
      const row = {
        id: randomUUID(),
        name,
        color,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(tags).values(row).run();
      return toTag(row);
    },

    listTags() {
      return db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(tags)
        .all()
        .map(toTag);
    },

    getTag(id) {
      const row = db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(tags)
        .where(eq(tags.id, id))
        .get();
      return row ? toTag(row) : null;
    },

    renameTag(id, name) {
      db.update(tags)
        .set({ name, updatedAt: new Date() })
        .where(eq(tags.id, id))
        .run();
    },

    recolorTag(id, color) {
      assertColor(color);
      db.update(tags)
        .set({ color, updatedAt: new Date() })
        .where(eq(tags.id, id))
        .run();
    },

    deleteTag(id) {
      // SQLite FK enforcement (and the schema's ON DELETE cascade) is off
      // unless `PRAGMA foreign_keys=ON`, which the shared store doesn't set —
      // so clear the associations explicitly rather than trusting the cascade,
      // and do both in one transaction so no orphan chat_tags rows can leak.
      return db.transaction((tx) => {
        const removedFromChats = tx
          .select({ chatId: chatTags.chatId })
          .from(chatTags)
          .where(eq(chatTags.tagId, id))
          .all().length;
        tx.delete(chatTags).where(eq(chatTags.tagId, id)).run();
        tx.delete(tags).where(eq(tags.id, id)).run();
        return { removedFromChats };
      });
    },

    assignTag(chatId, tagId) {
      db.insert(chatTags).values({ chatId, tagId }).onConflictDoNothing().run();
    },

    removeTag(chatId, tagId) {
      db.delete(chatTags)
        .where(and(eq(chatTags.chatId, chatId), eq(chatTags.tagId, tagId)))
        .run();
    },

    listTagsForChat(chatId) {
      return db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(chatTags)
        .innerJoin(tags, eq(chatTags.tagId, tags.id))
        .where(eq(chatTags.chatId, chatId))
        .all()
        .map(toTag);
    },

    listTagsByChat(chatIds) {
      const base = db
        .select({
          chatId: chatTags.chatId,
          id: tags.id,
          name: tags.name,
          color: tags.color,
        })
        .from(chatTags)
        .innerJoin(tags, eq(chatTags.tagId, tags.id));
      const rows =
        chatIds === undefined
          ? base.all()
          : chatIds.length === 0
            ? []
            : base.where(inArray(chatTags.chatId, chatIds)).all();

      const byChat = new Map<string, Tag[]>();
      for (const row of rows) {
        const list = byChat.get(row.chatId) ?? [];
        list.push(toTag(row));
        byChat.set(row.chatId, list);
      }
      return byChat;
    },

    listChatIdsWithAllTags(tagIds) {
      const distinct = [...new Set(tagIds)];
      if (distinct.length === 0) return [];
      return db
        .select({ chatId: chatTags.chatId })
        .from(chatTags)
        .where(inArray(chatTags.tagId, distinct))
        .groupBy(chatTags.chatId)
        .having(sql`count(${chatTags.tagId}) = ${distinct.length}`)
        .all()
        .map((r) => r.chatId);
    },
  };
}
