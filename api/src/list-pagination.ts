import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * The keyset page query (issue #129, ADR-0017). Owns one Archive connection with
 * the Metadata DB `ATTACH`ed read-only, and runs the cross-store sorted +
 * keyset-paginated Chat listing as a single SQL pass: intersection + `ORDER BY`
 * + keyset `LIMIT`, pushing the page limit into SQLite instead of materializing
 * the full filtered list in app code. This is the chosen strategy from the
 * throwaway spike, graduated into a real module — it owns the `ATTACH` and
 * closes it on teardown; ingestion and the write seams never `ATTACH`.
 *
 * It returns ordered `(id, sortKey)` rows only; ChatReader hydrates those ids
 * into the public Chat shape, keeping the SQL here and the derivation there.
 */

/** The two time axes the keyset index supports (ADR-0017). */
export type ListSort = "createdAt" | "updatedAt";

/**
 * Sort direction along the time axis. The covering `(sortKey, id)` indexes scan
 * either way, so asc and desc both stay a page-bounded index range scan — only
 * the keyset comparison and `ORDER BY` flip (issue #143).
 */
export type ListDirection = "asc" | "desc";

/** Keyset cursor: the (sortKey, id) of the last item on the previous page. */
export interface KeysetCursor {
  /** The sort column value in epoch ms (`first_seen_at` or `updated_at`). */
  sortKey: number;
  /** Internal `chats.id` (UUID) tiebreaker. */
  id: string;
}

export interface KeysetPageItem {
  /** Internal `chats.id` (UUID). */
  id: string;
  /** The sort column value in epoch ms. */
  sortKey: number;
}

export interface KeysetPage {
  items: KeysetPageItem[];
  /** Cursor to fetch the next page, or null when this is the last page. */
  nextCursor: KeysetCursor | null;
}

export interface KeysetPageQuery {
  sort: ListSort;
  /** Default "desc" (newest-first): the original keyset direction. */
  direction?: ListDirection;
  limit: number;
  cursor?: KeysetCursor;
  /** Default false: trashed chats are excluded from the page. */
  includeTrashed?: boolean;
  /**
   * Project filter (OR / union): the page keeps only chats in any of these
   * `chats.project` values. An empty-string entry selects the `(No project)`
   * group (NULL or ''). Omit or pass an empty array to leave Projects
   * unfiltered. Pushed into the keyset SQL so filtering and the page `LIMIT`
   * compose at scale (ADR-0017).
   */
  projects?: string[];
  /**
   * Tag filter (AND / intersection): the page keeps only chats holding every
   * selected real Tag. An empty-string entry selects the `Untagged` group (zero
   * Tags) — mixing it with a real Tag id naturally yields nothing. Omit or pass
   * an empty array to leave Tags unfiltered. Runs as a subquery against the
   * `ATTACH`ed `meta.chat_tags` (ADR-0017); ANDs across types with `projects`.
   */
  tags?: string[];
}

export interface ChatPageQuery {
  queryPage(query: KeysetPageQuery): KeysetPage;
  close(): void;
}

const ARCHIVE_DB = "archive.db";
const METADATA_DB = "metadata.db";

// The sort axis maps to a real, indexed column on `chats` — never interpolated
// from caller input, so the column name in the SQL stays a fixed whitelist.
const SORT_COLUMN: Record<ListSort, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
};

/** Opaque page token for the wire — base64 JSON of the (sortKey, id) cursor. */
export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decode an opaque page token; null when it is malformed. */
export function decodeCursor(token: string): KeysetCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    ) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as KeysetCursor).sortKey === "number" &&
      typeof (parsed as KeysetCursor).id === "string"
    ) {
      return parsed as KeysetCursor;
    }
    return null;
  } catch {
    return null;
  }
}

export function createChatPageQuery({
  dataDir,
}: {
  dataDir: string;
}): ChatPageQuery {
  // Read-only main connection; an attached DB inherits the main's read-only
  // mode, so the Metadata DB is never opened for writing from this path.
  const archive = new Database(path.join(dataDir, ARCHIVE_DB), {
    readonly: true,
  });
  // The Metadata store may not exist yet when nothing has been tagged or
  // trashed; treat an absent file as "no trashed, no tags" rather than failing.
  const metadataPath = path.join(dataDir, METADATA_DB);
  const hasMetadata = fs.existsSync(metadataPath);
  if (hasMetadata) {
    archive.prepare("ATTACH DATABASE ? AS meta").run(metadataPath);
  }

  function queryPage(query: KeysetPageQuery): KeysetPage {
    const col = SORT_COLUMN[query.sort];
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    // Active-list semantics: soft-deleted chats never appear in a page unless
    // the caller asks for trashed. The flag lives in the Metadata store, so the
    // exclusion rides the `ATTACH`ed `meta.chats_meta`.
    if (!query.includeTrashed && hasMetadata) {
      clauses.push(
        "c.id NOT IN (SELECT id FROM meta.chats_meta WHERE is_deleted = 1)"
      );
    }

    // Project filter (OR / union): coalesce folds NULL and '' into one
    // `(No project)` bucket, so an empty-string entry selects it. An empty
    // selection leaves Projects unfiltered (no clause). The placeholders are a
    // fixed count built from the array length, never interpolated values.
    if (query.projects && query.projects.length > 0) {
      const placeholders = query.projects.map(() => "?").join(", ");
      clauses.push(`coalesce(c.project, '') IN (${placeholders})`);
      params.push(...query.projects);
    }

    // Tag filter (AND / intersection). A real-Tag selection keeps only chats
    // holding every selected Tag — the grouped subquery counts matched Tags per
    // chat and requires the full set. The `Untagged` group (the '' marker) keeps
    // only chats with zero Tags. Both reference the `ATTACH`ed `meta.chat_tags`,
    // so with no Metadata store there are no tags: a real-Tag filter matches
    // nothing, and `Untagged` matches everything (no clause). Selecting both a
    // real Tag and '' at once ANDs to nothing, as intended.
    if (query.tags && query.tags.length > 0) {
      const realTagIds = query.tags.filter((t) => t !== "");
      const wantUntagged = query.tags.includes("");
      if (realTagIds.length > 0) {
        if (!hasMetadata) {
          // No tags exist, so no chat can hold the selected Tag.
          clauses.push("0");
        } else {
          const placeholders = realTagIds.map(() => "?").join(", ");
          clauses.push(
            `c.id IN (SELECT chat_id FROM meta.chat_tags
                      WHERE tag_id IN (${placeholders})
                      GROUP BY chat_id HAVING count(*) = ?)`
          );
          params.push(...realTagIds, realTagIds.length);
        }
      }
      if (wantUntagged && hasMetadata) {
        clauses.push("c.id NOT IN (SELECT chat_id FROM meta.chat_tags)");
      }
    }

    // The direction flips both the keyset comparison and the ORDER BY in lock
    // step, so the cursor stays strictly past the previous page's last row and
    // the page order matches. `desc` (default) walks newest-first with `<`;
    // `asc` walks oldest-first with `>`. The operator is a fixed whitelist, not
    // interpolated caller input.
    const direction: ListDirection = query.direction ?? "desc";
    const cmp = direction === "asc" ? ">" : "<";
    const order = direction === "asc" ? "ASC" : "DESC";

    // Keyset cursor: strictly after the last row of the previous page in the
    // (sortKey, id) order for this direction.
    if (query.cursor) {
      clauses.push(`(c.${col} ${cmp} ? OR (c.${col} = ? AND c.id ${cmp} ?))`);
      params.push(query.cursor.sortKey, query.cursor.sortKey, query.cursor.id);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    // Fetch one extra row to tell whether a next page exists without a count.
    const rows = archive
      .prepare(
        `SELECT c.id AS id, c.${col} AS sortKey
         FROM chats c ${where}
         ORDER BY c.${col} ${order}, c.id ${order}
         LIMIT ?`
      )
      .all(...params, query.limit + 1) as KeysetPageItem[];

    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > query.limit && last
        ? { sortKey: last.sortKey, id: last.id }
        : null;
    return { items, nextCursor };
  }

  return {
    queryPage,
    close() {
      archive.close();
    },
  };
}
