import type { TagMode } from "@/tags/tagModePreference";

/**
 * The Project/Tag/view filter a select-all-matching batch targets (#164), the
 * wire shape the server resolves through `buildFilterClauses` (ADR-0021). An
 * empty-string Tag entry is the `Untagged` marker; `includeTrashed` scopes it to
 * the Trash view.
 */
export interface BatchFilter {
  projects?: string[];
  tags?: string[];
  tagMode?: TagMode;
  includeTrashed?: boolean;
}

/**
 * What a batch action targets: either the explicit ids the user checked (#161),
 * or every Chat matching the filter minus a small exclusion set (#164). The
 * object doubles as the request body — the server discriminates on the presence
 * of `chatIds` vs `filter` (ADR-0021).
 */
export type BatchTarget =
  | { chatIds: string[] }
  | { filter: BatchFilter; excludeIds: string[] };
