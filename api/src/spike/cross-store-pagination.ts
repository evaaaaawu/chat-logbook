import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Spike (issue #128): prototype + benchmark two ways to run a filtered + sorted
 * + keyset-paginated Chat listing across the separate Archive and Metadata
 * SQLite stores.
 *
 *   (a) ATTACH the Metadata DB onto the Archive connection — one cross-database
 *       SQL pass does intersection + ORDER BY + keyset LIMIT.
 *   (b) App-level intersection of per-store candidate id sets (ADR-0016),
 *       extended with the sort + keyset slice the pagination slice needs.
 *
 * Throwaway code: it opens its own raw connections to `archive.db` /
 * `metadata.db` rather than going through the repositories, so the two
 * strategies can be compared side by side. The chosen shape graduates into a
 * real module in the pagination slice; this file does not.
 *
 * Sort key for the benchmark is `chats.first_seen_at` (createdAt) DESC with the
 * internal `chats.id` as a stable tiebreaker — both are real columns on the
 * Archive's `chats` table, so the variable under study stays the cross-store
 * intersection cost, not the cost of deriving `updatedAt` from `messages`.
 */

const ARCHIVE_DB = "archive.db";
const METADATA_DB = "metadata.db";

/** Keyset cursor: the (sortKey, id) of the last item on the previous page. */
export interface PageCursor {
  /** `chats.first_seen_at` in epoch ms. */
  sortKey: number;
  /** Internal `chats.id` (UUID) tiebreaker. */
  id: string;
}

export interface PageItem {
  /** Internal `chats.id` (UUID). */
  id: string;
  /** `chats.first_seen_at` in epoch ms. */
  sortKey: number;
}

export interface Page {
  items: PageItem[];
  /** Cursor to fetch the next page, or null when this is the last page. */
  nextCursor: PageCursor | null;
}

export interface PageQuery {
  limit: number;
  cursor?: PageCursor;
  /**
   * Project filter (OR / union). A Chat passes if its project is in the set.
   * An empty-string entry selects the `(No project)` group (project NULL or
   * ''). Omitting it leaves Projects unfiltered.
   */
  projects?: string[];
  /**
   * Tag filter (AND within). A Chat must hold every selected Tag to pass. An
   * empty-string entry selects the `Untagged` group (zero Tags) — mixing it
   * with a real Tag id naturally yields nothing. Omitting it leaves Tags
   * unfiltered.
   */
  tags?: string[];
}

export interface PaginatedQueryStrategy {
  listChatsPage(query: PageQuery): Page;
  close(): void;
}

export interface StrategyOptions {
  dataDir: string;
}

interface ChatRow {
  id: string;
  sortKey: number;
}

/** Newest first: first_seen_at DESC, id DESC. */
function compareDesc(a: ChatRow, b: ChatRow): number {
  if (a.sortKey !== b.sortKey) return b.sortKey - a.sortKey;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** True when `row` sorts strictly after `cursor` in the DESC order. */
function isAfterCursor(row: ChatRow, cursor: PageCursor): boolean {
  if (row.sortKey !== cursor.sortKey) return row.sortKey < cursor.sortKey;
  return row.id < cursor.id;
}

/** Slice a fully sorted candidate list into one keyset page. */
function paginate(sorted: ChatRow[], query: PageQuery): Page {
  const start = query.cursor
    ? sorted.filter((r) => isAfterCursor(r, query.cursor as PageCursor))
    : sorted;
  const items = start.slice(0, query.limit);
  const last = items[items.length - 1];
  const nextCursor =
    items.length === query.limit && last
      ? { sortKey: last.sortKey, id: last.id }
      : null;
  return { items, nextCursor };
}

export function createAppLevelStrategy(
  opts: StrategyOptions
): PaginatedQueryStrategy {
  const archive = new Database(path.join(opts.dataDir, ARCHIVE_DB), {
    readonly: true,
  });
  // The Metadata store may not exist yet when nothing has been tagged; treat an
  // absent file as "no Tags assigned" rather than failing to open it.
  const metadataPath = path.join(opts.dataDir, METADATA_DB);
  const metadata = fs.existsSync(metadataPath)
    ? new Database(metadataPath, { readonly: true })
    : null;

  function listChatsPage(query: PageQuery): Page {
    // An empty project set filters to nothing (an OR over no options).
    if (query.projects && query.projects.length === 0) {
      return { items: [], nextCursor: null };
    }

    // The Project filter is the Archive store's own indexed query (OR / union);
    // COALESCE folds NULL and '' into one `(No project)` bucket.
    let sql = "SELECT id, first_seen_at AS sortKey FROM chats";
    const params: string[] = [];
    if (query.projects) {
      const placeholders = query.projects.map(() => "?").join(", ");
      sql += ` WHERE coalesce(project, '') IN (${placeholders})`;
      params.push(...query.projects);
    }
    let rows = archive.prepare(sql).all(...params) as ChatRow[];

    // The Tag filter is the Metadata store's own indexed query; its candidate
    // id set is intersected with the Archive rows here in app code — the
    // cross-store intersection ADR-0016 mandates instead of one cross-database
    // JOIN. This is the work the ATTACH strategy pushes into a single SQL pass.
    const allowed = tagAllowedIds(query.tags);
    if (allowed) rows = rows.filter((r) => allowed.has(r.id));

    rows.sort(compareDesc);
    return paginate(rows, query);
  }

  /**
   * The set of Chat ids passing the Tag filter, or null when Tags are
   * unfiltered. Real Tag ids and the '' (Untagged) marker are ANDed: each
   * present condition narrows the set, so real + '' yields the empty set — a
   * Chat can't both hold every real Tag and hold none (matches the ChatReader
   * predicate established in ADR-0016).
   */
  function tagAllowedIds(tags: string[] | undefined): Set<string> | null {
    if (!tags) return null;
    const realTags = tags.filter((t) => t !== "");
    const wantUntagged = tags.includes("");

    let allowed: Set<string> | null = null; // null = no condition applied yet
    if (realTags.length > 0) {
      const holdingAll = new Set<string>();
      if (metadata) {
        const placeholders = realTags.map(() => "?").join(", ");
        const rows = metadata
          .prepare(
            `SELECT chat_id FROM chat_tags WHERE tag_id IN (${placeholders})
             GROUP BY chat_id HAVING count(*) = ?`
          )
          .all(...realTags, realTags.length) as { chat_id: string }[];
        for (const r of rows) holdingAll.add(r.chat_id);
      }
      allowed = holdingAll;
    }
    if (wantUntagged) {
      const tagged = new Set(
        metadata
          ? (
              metadata
                .prepare("SELECT DISTINCT chat_id FROM chat_tags")
                .all() as { chat_id: string }[]
            ).map((r) => r.chat_id)
          : []
      );
      const untagged = (
        archive.prepare("SELECT id FROM chats").all() as { id: string }[]
      )
        .map((r) => r.id)
        .filter((id) => !tagged.has(id));
      allowed =
        allowed === null
          ? new Set(untagged)
          : new Set(untagged.filter((id) => allowed!.has(id)));
    }
    return allowed;
  }

  return {
    listChatsPage,
    close() {
      archive.close();
      metadata?.close();
    },
  };
}

/**
 * Strategy (a): ATTACH the Metadata DB onto the Archive connection and run one
 * cross-database SQL pass — intersection + ORDER BY + keyset LIMIT in a single
 * query, pushing the page limit down into SQLite instead of materializing the
 * full filtered list in app code.
 */
export function createAttachStrategy(
  opts: StrategyOptions
): PaginatedQueryStrategy {
  const archive = new Database(path.join(opts.dataDir, ARCHIVE_DB));
  const metadataPath = path.join(opts.dataDir, METADATA_DB);
  const hasMetadata = fs.existsSync(metadataPath);
  if (hasMetadata) {
    archive.prepare("ATTACH DATABASE ? AS meta").run(metadataPath);
  }

  function listChatsPage(query: PageQuery): Page {
    if (query.projects && query.projects.length === 0) {
      return { items: [], nextCursor: null };
    }

    const clauses: string[] = [];
    const params: (string | number)[] = [];

    if (query.projects) {
      const ph = query.projects.map(() => "?").join(", ");
      clauses.push(`coalesce(c.project, '') IN (${ph})`);
      params.push(...query.projects);
    }

    if (query.tags) {
      const realTags = query.tags.filter((t) => t !== "");
      const wantUntagged = query.tags.includes("");
      if (realTags.length > 0) {
        if (!hasMetadata) return { items: [], nextCursor: null };
        const ph = realTags.map(() => "?").join(", ");
        clauses.push(
          `c.id IN (SELECT chat_id FROM meta.chat_tags WHERE tag_id IN (${ph})
                    GROUP BY chat_id HAVING count(*) = ?)`
        );
        params.push(...realTags, realTags.length);
      }
      if (wantUntagged && hasMetadata) {
        clauses.push("c.id NOT IN (SELECT chat_id FROM meta.chat_tags)");
      }
    }

    if (query.cursor) {
      clauses.push(
        "(c.first_seen_at < ? OR (c.first_seen_at = ? AND c.id < ?))"
      );
      params.push(query.cursor.sortKey, query.cursor.sortKey, query.cursor.id);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    // Fetch one extra row to tell whether a next page exists without a count.
    const rows = archive
      .prepare(
        `SELECT c.id AS id, c.first_seen_at AS sortKey
         FROM chats c ${where}
         ORDER BY c.first_seen_at DESC, c.id DESC
         LIMIT ?`
      )
      .all(...params, query.limit + 1) as ChatRow[];

    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > query.limit && last
        ? { sortKey: last.sortKey, id: last.id }
        : null;
    return { items, nextCursor };
  }

  return {
    listChatsPage,
    close() {
      archive.close();
    },
  };
}
