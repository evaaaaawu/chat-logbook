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
 * How the selected real Tags combine (ADR-0016 update). `all` (default) keeps
 * the AND intersection — a Chat must hold every selected Tag. `any` keeps a Chat
 * holding at least one, and lets the `Untagged` marker OR into that union
 * instead of ANDing to nothing. Governs Tag-to-Tag combination only; the Project
 * axis stays an OR/union and the cross-axis relation is unchanged.
 */
export type TagMode = "all" | "any";

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
  tagMode = "all",
  hasMetadata,
}: {
  projects?: string[];
  tags?: string[];
  tagMode?: TagMode;
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

  // Tag filter. `all` (default) intersects the selected real Tags — a chat must
  // hold every one — and the `Untagged` group ('' marker) keeps chats with zero
  // Tags; selecting both a real Tag and '' ANDs to nothing, as intended. `any`
  // unions the selected real Tags — a chat holding at least one — and lets
  // `Untagged` OR into that union ("holds no Tags OR holds a selected Tag"),
  // which is why the two fragments compose with OR here and AND in `all` mode
  // (ADR-0016 update). The real-Tag membership subquery is bound, never
  // interpolated, and stays an index range scan on `chat_tags` either way.
  if (tags && tags.length > 0) {
    const realTagIds = tags.filter((t) => t !== "");
    const wantUntagged = tags.includes("");

    // The real-Tag fragment, or null when nothing real is selected / no tags
    // can exist. In the no-Metadata case a real-Tag selection matches nothing
    // ("0"); the `Untagged` fragment is dropped there since every chat is
    // untagged (matching everything needs no clause).
    let realFragment: string | null = null;
    if (realTagIds.length > 0) {
      if (!hasMetadata) {
        realFragment = "0";
      } else {
        const placeholders = realTagIds.map(() => "?").join(", ");
        if (tagMode === "any") {
          realFragment = `c.id IN (SELECT DISTINCT chat_id FROM meta.chat_tags
                    WHERE tag_id IN (${placeholders}))`;
          params.push(...realTagIds);
        } else {
          realFragment = `c.id IN (SELECT chat_id FROM meta.chat_tags
                    WHERE tag_id IN (${placeholders})
                    GROUP BY chat_id HAVING count(*) = ?)`;
          params.push(...realTagIds, realTagIds.length);
        }
      }
    }

    const untaggedFragment =
      wantUntagged && hasMetadata
        ? "c.id NOT IN (SELECT chat_id FROM meta.chat_tags)"
        : null;

    // In `any` mode a real-Tag union and `Untagged` compose with OR into one
    // clause; in `all` mode they are independent predicates that each AND onto
    // the WHERE.
    if (tagMode === "any" && realFragment && untaggedFragment) {
      clauses.push(`(${realFragment} OR ${untaggedFragment})`);
    } else {
      if (realFragment) clauses.push(realFragment);
      if (untaggedFragment) clauses.push(untaggedFragment);
    }
  }

  return { clauses, params };
}
