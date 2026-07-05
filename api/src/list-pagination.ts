import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { buildFilterClauses, type TagMode } from "./list-filter.js";

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

/**
 * The sort axes the keyset index supports. `createdAt`/`updatedAt` are
 * denormalized columns on the Archive `chats` table (ADR-0017). `deletedAt` is
 * the Trash view's own axis (#145): it lives in the Metadata store
 * (`meta.chats_meta.deleted_at`), so it sorts through the `ATTACH`ed join and
 * is meaningful only for trashed chats.
 */
export type ListSort = "createdAt" | "updatedAt" | "deletedAt" | "title";

/**
 * Sort direction along the time axis. The covering `(sortKey, id)` indexes scan
 * either way, so asc and desc both stay a page-bounded index range scan — only
 * the keyset comparison and `ORDER BY` flip (issue #143).
 */
export type ListDirection = "asc" | "desc";

/** Keyset cursor: the (sortKey, id) of the last item on the previous page. */
export interface KeysetCursor {
  /**
   * The sort column value: epoch ms on the time axes, or the precomputed
   * collation string on the Title axis (ADR-0019). The opaque base64url(JSON)
   * token carries whichever shape the axis uses; the keyset comparison binds it
   * straight into SQL either way.
   */
  sortKey: number | string;
  /** Internal `chats.id` (UUID) tiebreaker. */
  id: string;
}

export interface KeysetPageItem {
  /** Internal `chats.id` (UUID). */
  id: string;
  /** The sort column value: epoch ms (time axes) or the Title collation string. */
  sortKey: number | string;
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
   * Default false. When true the page is the Trash view: only soft-deleted
   * chats (`is_deleted = 1`) appear, the inverse of the default active list.
   * Distinct from `includeTrashed` (active + trashed); this is trashed-only
   * (#145). With no Metadata store there are no trashed chats, so the page is
   * empty.
   */
  trashedOnly?: boolean;
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
  /**
   * How the selected real Tags combine (ADR-0016 update): `all` (default)
   * intersects them (hold every Tag), `any` unions them (hold at least one) and
   * lets the `Untagged` marker OR into that union. Governs Tag-to-Tag
   * combination only; `projects` stays an OR/union ANDed across types.
   */
  tagMode?: TagMode;
}

export interface ChatPageQuery {
  queryPage(query: KeysetPageQuery): KeysetPage;
  close(): void;
}

const ARCHIVE_DB = "archive.db";
const METADATA_DB = "metadata.db";

// The sort axis maps to a real, indexed column expression — never interpolated
// from caller input, so the column in the SQL stays a fixed whitelist. The two
// time axes are denormalized columns on the Archive `chats` (alias `c`);
// `deletedAt` lives on the `ATTACH`ed Metadata row (alias `m`), reached through
// the join the deletedAt path adds (#145).
const SORT_EXPR: Record<ListSort, string> = {
  createdAt: "c.created_at",
  updatedAt: "c.updated_at",
  deletedAt: "m.deleted_at",
  // The Title axis orders by the precomputed collation key on the ATTACHed
  // `meta.chat_sort_keys` (alias `k`), reached through the INNER JOIN added
  // below (ADR-0019). BINARY compare over `sort_key` is an index range scan.
  title: "k.sort_key",
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
    const sortKey = (parsed as KeysetCursor | null)?.sortKey;
    if (
      parsed &&
      typeof parsed === "object" &&
      (typeof sortKey === "number" || typeof sortKey === "string") &&
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
    const sortExpr = SORT_EXPR[query.sort];
    // The deletedAt axis lives in the Metadata store, so its sort + keyset run
    // through a join onto the `ATTACH`ed `meta.chats_meta` (alias `m`); the time
    // axes stay on `chats` alone. With no Metadata store there is nothing to
    // join and no trashed chats, so the page is empty.
    const needsDeletedJoin = query.sort === "deletedAt";
    // The Title axis orders by the precomputed key on `meta.chat_sort_keys`
    // (alias `k`), reached through an INNER JOIN — every chat has a row once
    // ingest/reconcile has run (ADR-0019). With no Metadata store there are no
    // sort keys to join, so the page is empty, matching the INNER JOIN.
    const needsSortKeyJoin = query.sort === "title";
    if ((needsDeletedJoin || needsSortKeyJoin) && !hasMetadata) {
      return { items: [], nextCursor: null };
    }
    let from = "chats c";
    if (needsDeletedJoin) from += " JOIN meta.chats_meta m ON m.id = c.id";
    if (needsSortKeyJoin) from += " JOIN meta.chat_sort_keys k ON k.id = c.id";
    // Tie-break by the joined id so the covering `(sortKey, id)` index serves the
    // whole ORDER BY: `m.id` on the deletedAt axis, `k.id` on the Title axis,
    // otherwise `c.id`. All three are the same value (joined on `= c.id`).
    const idCol = needsDeletedJoin
      ? "m.id"
      : needsSortKeyJoin
        ? "k.id"
        : "c.id";

    const clauses: string[] = [];
    const params: (string | number)[] = [];

    // Visibility scope. The Trash view (`trashedOnly`) keeps only soft-deleted
    // chats; the default active list keeps only non-deleted ones (unless the
    // caller opts into `includeTrashed`, which keeps both). The flag lives in
    // the Metadata store, so the scope rides the `ATTACH`ed `meta.chats_meta` —
    // and with no Metadata store there are no trashed chats, so Trash is empty.
    if (needsDeletedJoin) {
      // Deleted-time ordering is trash-only by nature: a non-trashed chat has a
      // null deleted_at and no place on this axis. The scope is phrased as
      // `deleted_at IS NOT NULL` (equivalent to `is_deleted = 1` — restore nulls
      // deleted_at) so it matches the partial `chats_meta_deleted_at_idx`
      // predicate exactly, letting that covering index drive the ordered scan.
      clauses.push("m.deleted_at IS NOT NULL");
    } else if (query.trashedOnly) {
      if (!hasMetadata) return { items: [], nextCursor: null };
      clauses.push(
        "c.id IN (SELECT id FROM meta.chats_meta WHERE is_deleted = 1)"
      );
    } else if (!query.includeTrashed && hasMetadata) {
      clauses.push(
        "c.id NOT IN (SELECT id FROM meta.chats_meta WHERE is_deleted = 1)"
      );
    }

    // The Project/Tag filter is the same predicate the filtered List count
    // applies (#131); it lives in `buildFilterClauses` so the two read paths
    // share it. Filtering and the page `LIMIT` compose at scale (ADR-0017).
    const filter = buildFilterClauses({
      projects: query.projects,
      tags: query.tags,
      tagMode: query.tagMode,
      hasMetadata,
    });
    clauses.push(...filter.clauses);
    params.push(...filter.params);

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
      clauses.push(
        `(${sortExpr} ${cmp} ? OR (${sortExpr} = ? AND ${idCol} ${cmp} ?))`
      );
      params.push(query.cursor.sortKey, query.cursor.sortKey, query.cursor.id);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    // Fetch one extra row to tell whether a next page exists without a count.
    const rows = archive
      .prepare(
        `SELECT c.id AS id, ${sortExpr} AS sortKey
         FROM ${from} ${where}
         ORDER BY ${sortExpr} ${order}, ${idCol} ${order}
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
