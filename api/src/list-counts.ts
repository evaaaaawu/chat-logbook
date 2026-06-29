import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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

  return {
    queryCounts,
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
