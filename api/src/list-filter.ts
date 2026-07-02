/**
 * The shared Project/Tag filter predicate (issue #130, ADR-0017). Both the
 * keyset page query and the filtered List count apply the same filter
 * semantics over the cross-store `chats c` + `ATTACH`ed `meta.*` shape — the
 * page adds an `ORDER BY` + keyset `LIMIT`, the count wraps a `count(*)`, but
 * the WHERE that picks which chats match is identical. It lives here so the two
 * read paths can never drift apart.
 *
 * The returned clauses assume the `chats` table is aliased `c` and that the
 * Metadata DB (when present) is attached as `meta`. The caller owns the view
 * predicate and the keyset cursor; this only contributes the filter, ANDed onto
 * whatever else the caller has pushed.
 */
export interface FilterClauses {
  /** SQL fragments to AND into the caller's WHERE; empty when nothing filters. */
  clauses: string[];
  /** Bind params, in the order the clauses reference them. */
  params: (string | number)[];
}

/**
 * Build the Project (OR / union) and Tag (AND / intersection) filter clauses.
 *
 * An empty-string Project entry selects the `(No project)` group (NULL or '');
 * an empty-string Tag entry selects the `Untagged` group (zero Tags). Omitting
 * a filter (undefined or empty array) leaves that axis unfiltered. With no
 * Metadata store there are no tags, so a real-Tag filter matches nothing and
 * `Untagged` matches everything (no clause). The placeholders are a fixed count
 * built from each array's length — caller values are bound, never interpolated.
 */
export function buildFilterClauses({
  projects,
  tags,
  hasMetadata,
}: {
  projects?: string[];
  tags?: string[];
  hasMetadata: boolean;
}): FilterClauses {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  // Project filter (OR / union): coalesce folds NULL and '' into the
  // `(No project)` bucket, so an empty-string entry selects it.
  if (projects && projects.length > 0) {
    const placeholders = projects.map(() => "?").join(", ");
    clauses.push(`coalesce(c.project, '') IN (${placeholders})`);
    params.push(...projects);
  }

  // Tag filter (AND / intersection). A real-Tag selection keeps only chats
  // holding every selected Tag — the grouped subquery counts matched Tags per
  // chat and requires the full set. The `Untagged` group (the '' marker) keeps
  // only chats with zero Tags. Selecting both a real Tag and '' at once ANDs to
  // nothing, as intended.
  if (tags && tags.length > 0) {
    const realTagIds = tags.filter((t) => t !== "");
    const wantUntagged = tags.includes("");
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

  return { clauses, params };
}
