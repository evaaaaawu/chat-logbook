import type { ArchiveRepository } from "./archive/repository.js";
import type { ChatRow } from "./archive/read-seam.js";
import type { MetadataRepository } from "./metadata/repository.js";
import { loadChatVisibility } from "./visibility.js";

/**
 * The Chat read face. At read time it composes Archive + Metadata into the
 * outward Chat/Message shapes the API serves — a read-time derivation, not a
 * materialized store. Owns the derivation that turns Archive rows into the
 * public Chat/Message JSON; the raw queries live behind `archive.read`, the
 * Archive read seam, so this never touches the drizzle handle.
 */

export type ChatRecord = ChatRow;

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
    return archive.read.findChatBySourceId(id);
  }

  function deriveTitle(
    customTitle: string | undefined,
    firstUserText: string | undefined
  ): string {
    if (customTitle && customTitle.trim()) return customTitle;
    const text = firstUserText?.trim().split("\n")[0]?.trim();
    return text && text.length > 0 ? text : "Untitled";
  }

  // Archive rows are keyed by (agent, source_id); NUL joins the pair into a
  // single Map key that can't collide with any value either field can hold.
  function key(agent: string, sourceId: string): string {
    return [agent, sourceId].join("\u0000");
  }

  function listChats({
    includeTrashed,
  }: {
    includeTrashed: boolean;
  }): ChatResponse[] {
    const visibility = loadChatVisibility(metadata, { includeTrashed });
    const rows = archive.read.listChatRows();

    // One grouped/windowed query per derived field, assembled in memory keyed
    // by (agent, source_id) — so listing N chats stays a constant query count
    // rather than ~3 per row. See issue #106.
    const tsRangeByKey = new Map(
      archive.read.listChatTsRanges().map((r) => [key(r.agent, r.sourceId), r])
    );

    const sourcePathByKey = new Map(
      archive.read
        .listLatestRawSourcePaths()
        .map((r) => [key(r.agent, r.sourceId), r.sourcePath])
    );

    const firstUserTextByKey = new Map(
      archive.read
        .listFirstUserTexts()
        .map((r) => [key(r.agent, r.sourceId), r.text])
    );

    const customTitleById = metadata.listCustomTitles();

    const chats: ChatResponse[] = [];
    for (const row of rows) {
      if (!visibility.isVisible(row.id)) continue;
      const isDeleted = visibility.isTrashed(row.id);

      const rowKey = key(row.agent, row.sourceId);
      const tsRange = tsRangeByKey.get(rowKey);
      const firstSeenAtMs = row.firstSeenAt.getTime();
      const chat: ChatResponse = {
        id: row.sourceId,
        chatId: row.chatId,
        agent: row.agent,
        title: deriveTitle(
          customTitleById.get(row.id),
          firstUserTextByKey.get(rowKey)
        ),
        project: row.project ?? "",
        projectPath: row.projectPath ?? null,
        sourceFilePath: sourcePathByKey.get(rowKey) ?? null,
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

    const rows = archive.read.listMessagesByChat(row.agent, row.sourceId);

    return rows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: (m.blocks as StoredBlock[]).map(toApiBlock),
      timestamp: m.ts.toISOString(),
    }));
  }

  return { listChats, getMessages, findChat };
}
