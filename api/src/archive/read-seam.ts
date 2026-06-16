import { and, asc, eq, sql } from "drizzle-orm";
import type { ArchiveDb } from "./repository.js";
import { chats, messages, rawMessages } from "./schema.js";

/**
 * The Archive read seam: the deliberate, read-oriented face onto the archive
 * tables that the Chat read path goes through instead of the raw drizzle
 * handle. Named query primitives — not a relabeled query builder — so the raw
 * handle can become private without the read path losing access. ChatReader
 * owns the derivation (titles, ts fallback, visibility); this owns the SQL.
 */

export type ChatRow = typeof chats.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

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

export interface ArchiveReadSeam {
  /** Every chat row, in insertion order. */
  listChatRows(): ChatRow[];
  /** Resolve a chat by its source id; null when absent. */
  findChatBySourceId(sourceId: string): ChatRow | null;
  /** Messages for one `(agent, source_id)` chat, ordered by ascending ts. */
  listMessagesByChat(agent: string, sourceId: string): MessageRow[];
  /**
   * One grouped row per `(agent, source_id)` with the min/max message ts.
   * A single grouped query — constant query count regardless of chat count.
   */
  listChatTsRanges(): ChatTsRange[];
  /**
   * The latest-ingested raw source path per `(agent, source_id)`, resolved
   * with a windowed query so listing N chats stays a constant query count.
   */
  listLatestRawSourcePaths(): LatestRawSourcePath[];
  /**
   * The earliest user message text per `(agent, source_id)`, resolved with a
   * windowed query so listing N chats stays a constant query count.
   */
  listFirstUserTexts(): FirstUserText[];
}

export function createArchiveReadSeam(db: ArchiveDb): ArchiveReadSeam {
  return {
    listChatRows() {
      return db.select().from(chats).all();
    },
    findChatBySourceId(sourceId) {
      return (
        db.select().from(chats).where(eq(chats.sourceId, sourceId)).get() ??
        null
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
    listChatTsRanges() {
      return db
        .select({
          agent: messages.agent,
          sourceId: messages.sourceId,
          minTs: sql<number | null>`min(${messages.ts})`,
          maxTs: sql<number | null>`max(${messages.ts})`,
        })
        .from(messages)
        .groupBy(messages.agent, messages.sourceId)
        .all();
    },
    listLatestRawSourcePaths() {
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
    listFirstUserTexts() {
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
        .where(eq(messages.role, "user"))
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
  };
}
