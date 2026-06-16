import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { ArchiveRepository } from "./archive/repository.js";
import {
  chats as archiveChats,
  messages as archiveMessages,
  rawMessages as archiveRawMessages,
} from "./archive/schema.js";
import type { MetadataRepository } from "./metadata/repository.js";
import { loadChatVisibility } from "./visibility.js";

/**
 * The Chat read face. At read time it composes Archive + Metadata into the
 * outward Chat/Message shapes the API serves — a read-time derivation, not a
 * materialized store. Owns every query that turns Archive rows into the
 * public Chat/Message JSON, so the HTTP layer never writes drizzle.
 */

export type ChatRecord = typeof archiveChats.$inferSelect;

export interface ChatResponse {
  id: string;
  chatId: string;
  agent: string;
  title: string;
  project: string;
  projectPath: string | null;
  sourceFilePath: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  isDeleted?: boolean;
}

export type ApiContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

export interface MessageResponse {
  role: "user" | "assistant";
  content: ApiContentBlock[];
  timestamp: string;
}

interface StoredBlock {
  type: string;
  [key: string]: unknown;
}

function toApiBlock(block: StoredBlock): ApiContentBlock {
  if (block.type === "tool_result") {
    return {
      type: "tool_result",
      tool_use_id: String(block.toolUseId ?? ""),
      content: block.content,
    };
  }
  return block as ApiContentBlock;
}

export interface ChatReader {
  listChats(opts: { includeTrashed: boolean }): ChatResponse[];
  /**
   * Messages for a Chat resolved by its source id. Returns null when the row
   * is absent or not visible — the caller maps both to 404 (the two existing
   * 404 paths collapse into one, behavior-preserving).
   */
  getMessages(
    id: string,
    opts: { includeTrashed: boolean }
  ): MessageResponse[] | null;
  /** Resolve a Chat by its source id for the mutation routes. */
  findChat(id: string): ChatRecord | null;
}

interface ChatReaderDeps {
  archive: ArchiveRepository;
  metadata: MetadataRepository;
}

export function createChatReader({
  archive,
  metadata,
}: ChatReaderDeps): ChatReader {
  function findChat(id: string): ChatRecord | null {
    return (
      archive.db
        .select()
        .from(archiveChats)
        .where(eq(archiveChats.sourceId, id))
        .get() ?? null
    );
  }

  function deriveTitle(row: ChatRecord): string {
    const custom = metadata.getCustomTitle(row.id);
    if (custom && custom.trim()) return custom;

    const firstUser = archive.db
      .select({ text: archiveMessages.text })
      .from(archiveMessages)
      .where(
        and(
          eq(archiveMessages.agent, row.agent),
          eq(archiveMessages.sourceId, row.sourceId),
          eq(archiveMessages.role, "user")
        )
      )
      .orderBy(asc(archiveMessages.ts))
      .limit(1)
      .get();

    const text = firstUser?.text?.trim().split("\n")[0]?.trim();
    return text && text.length > 0 ? text : "Untitled";
  }

  function listChats({
    includeTrashed,
  }: {
    includeTrashed: boolean;
  }): ChatResponse[] {
    const visibility = loadChatVisibility(metadata, { includeTrashed });
    const rows = archive.db.select().from(archiveChats).all();
    const chats: ChatResponse[] = [];

    for (const row of rows) {
      if (!visibility.isVisible(row.id)) continue;
      const isDeleted = visibility.isTrashed(row.id);

      const latestRaw = archive.db
        .select({ sourcePath: archiveRawMessages.sourcePath })
        .from(archiveRawMessages)
        .where(
          and(
            eq(archiveRawMessages.agent, row.agent),
            eq(archiveRawMessages.sourceId, row.sourceId)
          )
        )
        .orderBy(desc(archiveRawMessages.ingestedAt))
        .limit(1)
        .get();

      const tsRange = archive.db
        .select({
          minTs: sql<number | null>`min(${archiveMessages.ts})`,
          maxTs: sql<number | null>`max(${archiveMessages.ts})`,
        })
        .from(archiveMessages)
        .where(
          and(
            eq(archiveMessages.agent, row.agent),
            eq(archiveMessages.sourceId, row.sourceId)
          )
        )
        .get();

      const firstSeenAtMs = row.firstSeenAt.getTime();
      const chat: ChatResponse = {
        id: row.sourceId,
        chatId: row.chatId,
        agent: row.agent,
        title: deriveTitle(row),
        project: row.project ?? "",
        projectPath: row.projectPath ?? null,
        sourceFilePath: latestRaw?.sourcePath ?? null,
        createdAt: tsRange?.minTs ?? firstSeenAtMs,
        updatedAt: tsRange?.maxTs ?? firstSeenAtMs,
        deletedAt: visibility.deletedAt(row.id),
      };
      if (isDeleted) chat.isDeleted = true;
      chats.push(chat);
    }

    return chats;
  }

  function getMessages(
    id: string,
    { includeTrashed }: { includeTrashed: boolean }
  ): MessageResponse[] | null {
    const row = findChat(id);
    if (!row) return null;

    const visibility = loadChatVisibility(metadata, { includeTrashed });
    if (!visibility.isVisible(row.id)) return null;

    const rows = archive.db
      .select()
      .from(archiveMessages)
      .where(
        and(
          eq(archiveMessages.agent, row.agent),
          eq(archiveMessages.sourceId, row.sourceId)
        )
      )
      .orderBy(asc(archiveMessages.ts))
      .all();

    return rows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: (m.blocks as StoredBlock[]).map(toApiBlock),
      timestamp: m.ts.toISOString(),
    }));
  }

  return { listChats, getMessages, findChat };
}
