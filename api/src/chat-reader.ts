import type { ArchiveRepository } from "./archive/repository.js";
import { formatChatId, parseChatId } from "./archive/chat-id.js";
import type { ChatRow } from "./archive/read-seam.js";
import type { MetadataRepository } from "./metadata/repository.js";
import type { Tag, TagRepository } from "./metadata/tags.js";
import { loadChatVisibility } from "./visibility.js";
import {
  decodeCursor,
  encodeCursor,
  type ChatPageQuery,
  type ListDirection,
  type ListSort,
} from "./list-pagination.js";
import type { ChatCountsQuery, ListCounts } from "./list-counts.js";

/**
 * The Chat read face. At read time it composes Archive + Metadata into the
 * outward Chat/Message shapes the API serves — a read-time derivation, not a
 * materialized store. Owns the derivation that turns Archive rows into the
 * public Chat/Message JSON; the raw queries live behind `archive.read`, the
 * Archive read seam, so this never touches the drizzle handle.
 */

export type ChatRecord = ChatRow;

export interface ChatResponse {
  /** Public wire-form chat id (`clog_…`) — the canonical, paste-anywhere handle. */
  id: string;
  /** The originating Agent's source id, surfaced for display only — never a handle. */
  sourceId: string;
  agent: string;
  title: string;
  project: string;
  projectPath: string | null;
  sourceFilePath: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  isDeleted?: boolean;
  /** Tags assigned to this chat, batched in one grouped query (ADR-0016). */
  tags: Tag[];
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
  /**
   * List visible chats. `projects`, when given, filters server-side to chats in
   * any of those Projects (OR / union); an empty-string entry selects the
   * `(No project)` group. Omitting it returns every visible chat.
   */
  listChats(opts: {
    includeTrashed: boolean;
    projects?: string[];
    /**
     * Tag filter, AND within: a Chat must hold every selected Tag to pass. An
     * empty-string entry selects the `Untagged` group (zero Tags) — mixing it
     * with a real Tag id naturally yields nothing. Combined with `projects` (OR
     * within) the two AND across types. Omitting it leaves Tags unfiltered.
     */
    tags?: string[];
  }): ChatResponse[];
  /**
   * One keyset-paginated, server-sorted page of visible chats (ADR-0017). The
   * sort + windowing run inside the cross-store SQL pass, so the caller never
   * loads the full list. `cursor` is the opaque token returned as a prior page's
   * `nextCursor`; omitting it returns the first page. Trashed chats are excluded
   * unless `includeTrashed` is set. `nextCursor` is null on the last page.
   */
  listChatsPage(opts: {
    sort: ListSort;
    /** Sort direction along the time axis; defaults to "desc" (newest-first). */
    direction?: ListDirection;
    limit: number;
    cursor?: string;
    includeTrashed?: boolean;
    /**
     * Trash view scope: when true the page returns only soft-deleted chats
     * (#145), distinct from `includeTrashed` (active + trashed). Pairs with the
     * `deletedAt` sort axis but also applies to the time axes within Trash.
     */
    trashedOnly?: boolean;
    /**
     * Project filter (OR / union), applied server-side inside the keyset query
     * (#130). An empty-string entry selects the `(No project)` group; omitting
     * it leaves Projects unfiltered.
     */
    projects?: string[];
    /**
     * Tag filter (AND / intersection), applied server-side inside the keyset
     * query (#130). An empty-string entry selects the `Untagged` group; omitting
     * it leaves Tags unfiltered.
     */
    tags?: string[];
  }): { chats: ChatResponse[]; nextCursor: string | null };
  /**
   * The filter-panel facet counts and the unfiltered List count for a view
   * (issue #131 Phase A). Static per view (main vs Trash) — they count the
   * view's whole universe and do not change when a filter is selected — so this
   * takes no filter. Server-derived so the paginated frontend need not hold the
   * full Chat list to count from. Requires a `countsQuery` dependency.
   */
  listCounts(opts: { includeTrashed?: boolean }): ListCounts;
  /**
   * The filtered List count ("Chats N" when a filter is active; issue #131
   * Phase B). Applies the active Project (OR) / Tag (AND) / Untagged filter and
   * returns the post-filter result count, server-derived so the paginated
   * frontend need not hold the filtered window to count from. Requires a
   * `countsQuery` dependency.
   */
  listFilteredTotal(opts: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
  }): number;
  /**
   * Messages for a Chat resolved by its public wire-form chat id (`clog_…`).
   * Returns null when the id is malformed, no chat matches, or it is not visible
   * — the caller maps all of these to 404 (the 404 paths collapse into one).
   */
  getMessages(
    id: string,
    opts: { includeTrashed: boolean }
  ): MessageResponse[] | null;
  /**
   * Resolve a Chat by its public wire-form chat id (`clog_…`) for the mutation
   * routes. Returns null when the id is malformed or no chat matches — both map
   * to 404. Source ids and bare codes do not resolve.
   */
  findChat(id: string): ChatRecord | null;
}

interface ChatReaderDeps {
  archive: ArchiveRepository;
  metadata: MetadataRepository;
  tags: TagRepository;
  /**
   * The keyset page query that runs the cross-store sorted + paginated listing
   * (ADR-0017). Optional so the full-list read paths (and their tests) compose
   * without it; `listChatsPage` requires it.
   */
  pageQuery?: ChatPageQuery;
  /**
   * The facet-count aggregation that runs the cross-store per-view counts
   * (issue #131 Phase A). Optional so the read paths that don't count compose
   * without it; `listCounts` requires it.
   */
  countsQuery?: ChatCountsQuery;
}

export function createChatReader({
  archive,
  metadata,
  tags,
  pageQuery,
  countsQuery,
}: ChatReaderDeps): ChatReader {
  function findChat(id: string): ChatRecord | null {
    const code = parseChatId(id);
    if (code === null) return null;
    return archive.read.findChatByChatId(code);
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
    projects,
    tags: tagSelection,
  }: {
    includeTrashed: boolean;
    projects?: string[];
    tags?: string[];
  }): ChatResponse[] {
    const visibility = loadChatVisibility(metadata, { includeTrashed });
    const rows = archive.read.listChatRows(projects ? { projects } : undefined);

    // Tag filter (AND within) is resolved as a per-Chat predicate intersected
    // in app code with the Project-filtered Archive rows — the cross-store
    // intersection ADR-0016 mandates instead of a single cross-database JOIN.
    // A real-id set comes from the AND-intersection query; the `Untagged`
    // group is "holds no Tag at all", so it excludes any Chat that appears in
    // the grouped tags map. Selecting both at once leaves nothing, as intended.
    let passesTagFilter: ((chatInternalId: string) => boolean) | null = null;
    if (tagSelection) {
      const realTagIds = tagSelection.filter((t) => t !== "");
      const wantUntagged = tagSelection.includes("");
      const allowedByTags =
        realTagIds.length > 0
          ? new Set(tags.listChatIdsWithAllTags(realTagIds))
          : null;
      const taggedChatIds = wantUntagged
        ? new Set(tags.listTagsByChat().keys())
        : null;
      passesTagFilter = (chatInternalId) => {
        if (allowedByTags && !allowedByTags.has(chatInternalId)) return false;
        if (taggedChatIds && taggedChatIds.has(chatInternalId)) return false;
        return true;
      };
    }

    const toResponse = loadHydration();

    const chats: ChatResponse[] = [];
    for (const row of rows) {
      if (!visibility.isVisible(row.id)) continue;
      if (passesTagFilter && !passesTagFilter(row.id)) continue;
      chats.push(toResponse(row, visibility));
    }

    return chats;
  }

  // Loads the grouped/windowed derivation maps once (one query per derived
  // field, never ~3 per row — issue #106) and returns an assembler that turns a
  // single Archive chat row + visibility into the public Chat shape. Shared by
  // the full-list (`listChats`) and paginated (`listChatsPage`) read paths.
  function loadHydration(): (
    row: ChatRow,
    visibility: ReturnType<typeof loadChatVisibility>
  ) => ChatResponse {
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
    // One grouped query for every chat's tags, keyed by internal id — never one
    // query per chat (ADR-0016).
    const tagsByChatId = tags.listTagsByChat();

    return (row, visibility) => {
      const rowKey = key(row.agent, row.sourceId);
      const tsRange = tsRangeByKey.get(rowKey);
      const firstSeenAtMs = row.firstSeenAt.getTime();
      const chat: ChatResponse = {
        id: formatChatId(row.chatId),
        sourceId: row.sourceId,
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
        tags: tagsByChatId.get(row.id) ?? [],
      };
      if (visibility.isTrashed(row.id)) chat.isDeleted = true;
      return chat;
    };
  }

  function listChatsPage({
    sort,
    direction,
    limit,
    cursor,
    includeTrashed = false,
    trashedOnly = false,
    projects,
    tags: tagSelection,
  }: {
    sort: ListSort;
    direction?: ListDirection;
    limit: number;
    cursor?: string;
    includeTrashed?: boolean;
    trashedOnly?: boolean;
    projects?: string[];
    tags?: string[];
  }): { chats: ChatResponse[]; nextCursor: string | null } {
    if (!pageQuery) {
      throw new Error("listChatsPage requires a pageQuery dependency");
    }
    // A malformed cursor decodes to null; treat it as "no cursor" (first page)
    // rather than throwing — the window simply re-anchors.
    const decoded = cursor ? (decodeCursor(cursor) ?? undefined) : undefined;
    const page = pageQuery.queryPage({
      sort,
      direction,
      limit,
      cursor: decoded,
      includeTrashed,
      trashedOnly,
      projects,
      tags: tagSelection,
    });

    // The keyset SQL already applied visibility + ordering; hydration is pure
    // assembly over the page's ids, in page order. Visibility is still loaded so
    // `deletedAt`/`isDeleted` render on the trashed paths (includeTrashed or the
    // trashed-only Trash view).
    const visibility = loadChatVisibility(metadata, {
      includeTrashed: includeTrashed || trashedOnly,
    });
    const rowById = new Map(archive.read.listChatRows().map((r) => [r.id, r]));
    const toResponse = loadHydration();

    const chats: ChatResponse[] = [];
    for (const item of page.items) {
      const row = rowById.get(item.id);
      if (row) chats.push(toResponse(row, visibility));
    }

    return {
      chats,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }

  function listCounts({
    includeTrashed = false,
  }: {
    includeTrashed?: boolean;
  }): ListCounts {
    if (!countsQuery) {
      throw new Error("listCounts requires a countsQuery dependency");
    }
    return countsQuery.queryCounts({ includeTrashed });
  }

  function listFilteredTotal({
    includeTrashed = false,
    projects,
    tags,
  }: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
  }): number {
    if (!countsQuery) {
      throw new Error("listFilteredTotal requires a countsQuery dependency");
    }
    return countsQuery.queryFilteredTotal({ includeTrashed, projects, tags });
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

  return {
    listChats,
    listChatsPage,
    listCounts,
    listFilteredTotal,
    getMessages,
    findChat,
  };
}
