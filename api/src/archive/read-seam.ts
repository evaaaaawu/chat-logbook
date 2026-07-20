import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { ArchiveDb } from "./repository.js";
import { chats, ingestionEvents, messages, rawMessages } from "./schema.js";

/**
 * The Archive read seam: the deliberate, read-oriented face onto the archive
 * tables that the Chat read path goes through instead of the raw drizzle
 * handle. Named query primitives — not a relabeled query builder — so the raw
 * handle can become private without the read path losing access. ChatReader
 * owns the derivation (titles, ts fallback, visibility); this owns the SQL.
 */

export type ChatRow = typeof chats.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type IngestionEventRow = typeof ingestionEvents.$inferSelect;

/** Per `(agent, source_id)` first/last message timestamps for a chat. */
export interface ChatTsRange {
  agent: string;
  sourceId: string;
  minTs: number | null;
  maxTs: number | null;
}

/** The source file path of the most-recently-ingested raw row for a chat. */
export interface LatestRawSourcePath {
  agent: string;
  sourceId: string;
  sourcePath: string;
}

/** The earliest user message text for a chat, by message timestamp. */
export interface FirstUserText {
  agent: string;
  sourceId: string;
  text: string;
}

/** A raw message row, the input the re-normalize pass rebuilds Normalized from. */
export interface RawMessageRow {
  id: number;
  agent: string;
  sourceId: string;
  sourcePath: string;
  rawPayload: string;
}

export interface ArchiveReadSeam {
  /**
   * Chat rows in insertion order. With `projects`, filters server-side to rows
   * whose project is in the set (OR / union) — an empty-string entry selects
   * the `(No project)` group (project NULL or ''). An empty array filters to
   * nothing; omitting `projects` returns every row.
   */
  listChatRows(opts?: { projects?: string[] }): ChatRow[];
  /**
   * Chat rows for a specific set of internal ids, in no guaranteed order (the
   * caller re-orders). Bounded by the id set, so hydrating one keyset page stays
   * O(page) instead of loading the whole table (issue #158).
   */
  listChatRowsByIds(ids: string[]): ChatRow[];
  /** Resolve a chat by its source id; null when absent. */
  findChatBySourceId(sourceId: string): ChatRow | null;
  /** Resolve a chat by its bare chat_id code (the public handle); null when absent. */
  findChatByChatId(chatId: string): ChatRow | null;
  /** Messages for one `(agent, source_id)` chat, ordered by ascending ts. */
  listMessagesByChat(agent: string, sourceId: string): MessageRow[];
  /**
   * The Raw payload one normalized message was parsed from, as stored JSON text.
   * The image endpoint reads bytes back out of it at request time (ADR-0023), so
   * an archived image survives its Source file being deleted. Null when the
   * message does not exist.
   */
  findRawPayloadForMessage(
    agent: string,
    sourceId: string,
    messageId: string
  ): string | null;
  /**
   * One grouped row per `(agent, source_id)` with the min/max message ts.
   * A single grouped query — constant query count regardless of chat count.
   * With `sourceIds`, scopes the scan to those chats so page hydration does not
   * aggregate the whole messages table (issue #158).
   */
  listChatTsRanges(opts?: { sourceIds?: string[] }): ChatTsRange[];
  /**
   * The latest-ingested raw source path per `(agent, source_id)`, resolved
   * with a windowed query so listing N chats stays a constant query count.
   * `sourceIds` scopes the scan to a page's chats (issue #158).
   */
  listLatestRawSourcePaths(opts?: {
    sourceIds?: string[];
  }): LatestRawSourcePath[];
  /**
   * The earliest user message text per `(agent, source_id)`, resolved with a
   * windowed query so listing N chats stays a constant query count. `sourceIds`
   * scopes the scan to a page's chats (issue #158).
   */
  listFirstUserTexts(opts?: { sourceIds?: string[] }): FirstUserText[];
  /** Every ingestion-event audit row, in insertion order. */
  listIngestionEvents(): IngestionEventRow[];
  /**
   * Every raw message row, in insertion (id) order. The re-normalize pass reads
   * these to rebuild the Normalized layer without touching Source (ADR-0004);
   * `rawPayload` is the verbatim per-agent JSON the plugin re-parses.
   */
  listRawMessages(): RawMessageRow[];
}

export function createArchiveReadSeam(db: ArchiveDb): ArchiveReadSeam {
  return {
    listChatRows(opts) {
      const projects = opts?.projects;
      if (projects) {
        // Empty-string entries select the `(No project)` group, so compare
        // against COALESCE(project,'') to fold NULL and '' into one bucket.
        return db
          .select()
          .from(chats)
          .where(inArray(sql`coalesce(${chats.project}, '')`, projects))
          .all();
      }
      return db.select().from(chats).all();
    },
    listChatRowsByIds(ids) {
      if (ids.length === 0) return [];
      return db.select().from(chats).where(inArray(chats.id, ids)).all();
    },
    findChatBySourceId(sourceId) {
      return (
        db.select().from(chats).where(eq(chats.sourceId, sourceId)).get() ??
        null
      );
    },
    findChatByChatId(chatId) {
      return (
        db.select().from(chats).where(eq(chats.chatId, chatId)).get() ?? null
      );
    },
    listMessagesByChat(agent, sourceId) {
      return db
        .select()
        .from(messages)
        .where(and(eq(messages.agent, agent), eq(messages.sourceId, sourceId)))
        .orderBy(asc(messages.ts))
        .all();
    },
    findRawPayloadForMessage(agent, sourceId, messageId) {
      const row = db
        .select({ rawPayload: rawMessages.rawPayload })
        .from(messages)
        .innerJoin(rawMessages, eq(messages.rawId, rawMessages.id))
        .where(
          and(
            eq(messages.agent, agent),
            eq(messages.sourceId, sourceId),
            eq(messages.messageId, messageId)
          )
        )
        .get();
      return row?.rawPayload ?? null;
    },
    listChatTsRanges(opts) {
      const scope =
        opts?.sourceIds !== undefined
          ? inArray(messages.sourceId, opts.sourceIds)
          : sql`1 = 1`;
      return db
        .select({
          agent: messages.agent,
          sourceId: messages.sourceId,
          minTs: sql<number | null>`min(${messages.ts})`,
          maxTs: sql<number | null>`max(${messages.ts})`,
        })
        .from(messages)
        .where(scope)
        .groupBy(messages.agent, messages.sourceId)
        .all();
    },
    listLatestRawSourcePaths(opts) {
      const scope =
        opts?.sourceIds !== undefined
          ? inArray(rawMessages.sourceId, opts.sourceIds)
          : sql`1 = 1`;
      const ranked = db
        .select({
          agent: rawMessages.agent,
          sourceId: rawMessages.sourceId,
          sourcePath: rawMessages.sourcePath,
          rn: sql<number>`row_number() over (partition by ${rawMessages.agent}, ${rawMessages.sourceId} order by ${rawMessages.ingestedAt} desc)`.as(
            "rn"
          ),
        })
        .from(rawMessages)
        .where(scope)
        .as("ranked_raw");
      return db
        .select({
          agent: ranked.agent,
          sourceId: ranked.sourceId,
          sourcePath: ranked.sourcePath,
        })
        .from(ranked)
        .where(eq(ranked.rn, 1))
        .all();
    },
    listFirstUserTexts(opts) {
      const scope =
        opts?.sourceIds !== undefined
          ? and(
              eq(messages.role, "user"),
              inArray(messages.sourceId, opts.sourceIds)
            )
          : eq(messages.role, "user");
      const ranked = db
        .select({
          agent: messages.agent,
          sourceId: messages.sourceId,
          text: messages.text,
          rn: sql<number>`row_number() over (partition by ${messages.agent}, ${messages.sourceId} order by ${messages.ts} asc)`.as(
            "rn"
          ),
        })
        .from(messages)
        .where(scope)
        .as("ranked_user");
      return db
        .select({
          agent: ranked.agent,
          sourceId: ranked.sourceId,
          text: ranked.text,
        })
        .from(ranked)
        .where(eq(ranked.rn, 1))
        .all();
    },
    listIngestionEvents() {
      return db.select().from(ingestionEvents).all();
    },
    listRawMessages() {
      return db
        .select({
          id: rawMessages.id,
          agent: rawMessages.agent,
          sourceId: rawMessages.sourceId,
          sourcePath: rawMessages.sourcePath,
          rawPayload: rawMessages.rawPayload,
        })
        .from(rawMessages)
        .orderBy(asc(rawMessages.id))
        .all();
    },
  };
}
