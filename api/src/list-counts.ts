import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { buildFilterClauses, type TagMode } from "./list-filter.js";

/**
 * The facet-count aggregation (issue #131 Phase A, ADR-0017). Owns one Archive
 * connection with the Metadata DB `ATTACH`ed read-only — the same cross-store
 * shape as the keyset page query — and computes the filter panel's static,
 * per-view counts in a single SQL pass: the unfiltered List count (the view's
 * total), the per-Project and per-Tag facet counts, and the untagged group.
 *
 * These counts are the view's whole universe (main vs Trash) and do NOT change
 * when a Project/Tag filter is selected — so the server takes no filter here.
 * The filtered List count (when a filter IS active) is Phase B, riding on #130.
 */

/** A Project facet: the count and recency for one `chats.project` value. */
export interface ProjectCount {
  /** The `chats.project` value; "" identifies the `(No project)` group. */
  project: string;
  count: number;
  /** Most-recent `updated_at` across the group — the facet recency sort key. */
  lastActiveAt: number;
}

/** A Tag facet: how many Chats in the view hold this Tag. */
export interface TagCount {
  tagId: string;
  count: number;
}

export interface ListCounts {
  /** The unfiltered List count ("Chats N") for the view. */
  total: number;
  /** Per-Project facet counts; "" is the `(No project)` group. */
  projects: ProjectCount[];
  /** Per-Tag facet counts. */
  tags: TagCount[];
  /** How many Chats in the view hold zero Tags. */
  untagged: number;
}

export interface ChatCountsQuery {
  queryCounts(opts: { includeTrashed?: boolean }): ListCounts;
  /**
   * The filtered List count ("Chats N" when a filter is active; issue #131
   * Phase B). Applies the same Project (OR) / Tag (AND) / Untagged filter
   * semantics as the keyset page query (#130) but returns `COUNT(*)` instead of
   * a page — so the post-filter total is accurate at scale without loading the
   * filtered window. An empty-string entry selects the `(No project)` /
   * `Untagged` group; an empty or omitted array leaves that type unfiltered.
   */
  queryFilteredTotal(opts: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
    /**
     * How the selected real Tags combine (ADR-0016 update): `all` (default) ANDs
     * them (hold every Tag), `any` ORs them (hold at least one) and lets
     * `Untagged` join that union. Only the List total follows the mode.
     */
    tagMode?: TagMode;
  }): number;
  /**
   * Resolve the filter branch of a batch action (#164, ADR-0021) to the set of
   * internal Chat ids it targets: every Chat matching the active view + filter,
   * minus `excludeIds` (the small set the user unchecked after selecting all).
   * Reuses the same `buildFilterClauses` predicate as the list, so the batch
   * write can never disagree with what the list showed as matching. `excludeIds`
   * are internal Chat ids, resolved from the wire ids by the caller.
   */
  queryFilteredIds(opts: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
    tagMode?: TagMode;
    excludeIds?: string[];
  }): string[];
  /**
   * Per-Tag counts over the Chats matching the active view + filter (#164) —
   * unlike `queryCounts`, which counts each Tag over the whole view, this scopes
   * the count to the same `buildFilterClauses` set the filtered list shows. It
   * feeds the batch dialog's tri-state under select-all-matching, so a narrowing
   * Project/Tag filter stays accurate. Empty when there is no Metadata store.
   */
  queryFilteredTagCounts(opts: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
    tagMode?: TagMode;
  }): TagCount[];
  close(): void;
}

const ARCHIVE_DB = "archive.db";
const METADATA_DB = "metadata.db";

export function createChatCountsQuery({
  dataDir,
}: {
  dataDir: string;
}): ChatCountsQuery {
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

  function queryCounts({
    includeTrashed = false,
  }: {
    includeTrashed?: boolean;
  }): ListCounts {
    // View predicate: which chats belong to this view's universe. main =
    // active (not soft-deleted); Trash = soft-deleted. Both live in the
    // `ATTACH`ed `meta.chats_meta`; with no Metadata store nothing is trashed,
    // so main is everything and Trash is empty.
    const viewClause = viewPredicate(includeTrashed, hasMetadata);

    const total = (
      archive
        .prepare(`SELECT count(*) AS n FROM chats c ${viewClause}`)
        .get() as { n: number }
    ).n;

    // Per-Project facet counts. coalesce folds NULL and '' into one
    // `(No project)` bucket, matching the Project filter's own bucketing
    // (ADR-0017). `lastActiveAt` carries each group's recency so the facet
    // panel can order most-recently-active first without loading the chats.
    const projects = archive
      .prepare(
        `SELECT coalesce(c.project, '') AS project,
                count(*) AS count,
                max(c.updated_at) AS lastActiveAt
         FROM chats c ${viewClause}
         GROUP BY coalesce(c.project, '')`
      )
      .all() as ProjectCount[];

    // Per-Tag facet counts. Joins the `ATTACH`ed `meta.chat_tags` to the
    // in-view chats so a trashed chat (main view) or an active chat (Trash
    // view) drops out. With no Metadata store there are no tags, so the join is
    // skipped entirely rather than referencing a missing table.
    const tags: TagCount[] = hasMetadata
      ? (archive
          .prepare(
            `SELECT ct.tag_id AS tagId, count(*) AS count
             FROM meta.chat_tags ct
             JOIN chats c ON c.id = ct.chat_id
             ${viewClause}
             GROUP BY ct.tag_id`
          )
          .all() as TagCount[])
      : [];

    // Untagged group: in-view chats holding zero Tags. With no Metadata store
    // nothing is tagged, so every in-view chat is untagged — which is the
    // total. With metadata the view clause is always present, so the predicate
    // ANDs onto it.
    const untagged = hasMetadata
      ? (
          archive
            .prepare(
              `SELECT count(*) AS n
               FROM chats c ${viewClause}
               AND c.id NOT IN (SELECT chat_id FROM meta.chat_tags)`
            )
            .get() as { n: number }
        ).n
      : total;

    return { total, projects, tags, untagged };
  }

  /**
   * The view + Project/Tag filter WHERE shared by the filtered count and the
   * filter-branch id resolution (#130, #164). Returns `null` when the view is
   * provably empty without SQL (Trash with no Metadata store). The clauses live
   * in `buildFilterClauses` so every filtered read path applies one predicate.
   */
  function buildViewAndFilter({
    includeTrashed = false,
    projects,
    tags,
    tagMode = "all",
  }: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
    tagMode?: TagMode;
  }): { clauses: string[]; params: (string | number)[] } | null {
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    // View predicate: main excludes soft-deleted, Trash keeps only soft-deleted.
    if (hasMetadata) {
      clauses.push(
        includeTrashed
          ? "c.id IN (SELECT id FROM meta.chats_meta WHERE is_deleted = 1)"
          : "c.id NOT IN (SELECT id FROM meta.chats_meta WHERE is_deleted = 1)"
      );
    } else if (includeTrashed) {
      // No Metadata store: nothing is trashed, so the Trash view is empty.
      return null;
    }

    // The Project/Tag filter is the same predicate the keyset page applies
    // (#130); it lives in `buildFilterClauses` so the two read paths share it.
    const filter = buildFilterClauses({ projects, tags, tagMode, hasMetadata });
    clauses.push(...filter.clauses);
    params.push(...filter.params);
    return { clauses, params };
  }

  function queryFilteredTotal(opts: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
    tagMode?: TagMode;
  }): number {
    const built = buildViewAndFilter(opts);
    if (built === null) return 0;
    const where =
      built.clauses.length > 0 ? `WHERE ${built.clauses.join(" AND ")}` : "";
    return (
      archive
        .prepare(`SELECT count(*) AS n FROM chats c ${where}`)
        .get(...built.params) as { n: number }
    ).n;
  }

  function queryFilteredIds({
    excludeIds,
    ...filterOpts
  }: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
    tagMode?: TagMode;
    excludeIds?: string[];
  }): string[] {
    const built = buildViewAndFilter(filterOpts);
    if (built === null) return [];
    const { clauses, params } = built;

    // The exclusions are the rows the user unchecked after selecting all — a
    // small `NOT IN` (ADR-0021), bound, never interpolated.
    if (excludeIds && excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => "?").join(", ");
      clauses.push(`c.id NOT IN (${placeholders})`);
      params.push(...excludeIds);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return (
      archive
        .prepare(`SELECT c.id AS id FROM chats c ${where}`)
        .all(...params) as { id: string }[]
    ).map((r) => r.id);
  }

  function queryFilteredTagCounts(opts: {
    includeTrashed?: boolean;
    projects?: string[];
    tags?: string[];
    tagMode?: TagMode;
  }): TagCount[] {
    // No Metadata store means no tags exist at all.
    if (!hasMetadata) return [];
    const built = buildViewAndFilter(opts);
    if (built === null) return [];
    const where =
      built.clauses.length > 0 ? `WHERE ${built.clauses.join(" AND ")}` : "";
    // Join the filter-matched chats to their tags and group — the same shape as
    // the view-wide facet, but scoped to the filter instead of the whole view.
    return archive
      .prepare(
        `SELECT ct.tag_id AS tagId, count(*) AS count
         FROM meta.chat_tags ct
         JOIN chats c ON c.id = ct.chat_id
         ${where}
         GROUP BY ct.tag_id`
      )
      .all(...built.params) as TagCount[];
  }

  return {
    queryCounts,
    queryFilteredTotal,
    queryFilteredIds,
    queryFilteredTagCounts,
    close() {
      archive.close();
    },
  };
}

/**
 * The `WHERE` that scopes a count to the active view. Empty when there is no
 * Metadata store (nothing is trashed): main is every chat, Trash is none — but
 * the caller short-circuits the Trash-with-no-metadata case to zero before SQL.
 */
function viewPredicate(includeTrashed: boolean, hasMetadata: boolean): string {
  if (!hasMetadata) {
    return includeTrashed ? "WHERE 0" : "";
  }
  return includeTrashed
    ? "WHERE c.id IN (SELECT id FROM meta.chats_meta WHERE is_deleted = 1)"
    : "WHERE c.id NOT IN (SELECT id FROM meta.chats_meta WHERE is_deleted = 1)";
}
