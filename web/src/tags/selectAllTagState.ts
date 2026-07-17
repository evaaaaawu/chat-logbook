/**
 * Tri-state derivation for the batch TagPickerDialog under select-all-matching
 * (#164). The dialog cannot enumerate every matching Chat — the Selection is
 * "all matching minus `excludeIds`", a set the client never holds (ADR-0021).
 * So each Tag row's all/some/none is computed from counts instead of a per-Chat
 * scan: the facet count of matching Chats holding the Tag, minus the excluded
 * Chats that held it, compared against the selected total.
 */

/** A Tag row's state across the Selection, matching the dialog's own vocabulary. */
export type TagState = "all" | "some" | "none";

export interface SelectAllTagStateInput {
  /** Chats currently selected: the filtered total minus the excluded rows. */
  selectedCount: number;
  /**
   * How many Chats matching the filter hold each Tag — the per-view facet count
   * (#131), keyed by Tag id. A Tag absent from the map counts as zero.
   */
  tagCounts: ReadonlyMap<string, number>;
  /**
   * The Tag ids held by each excluded Chat (the rows the user unchecked after
   * selecting all). Subtracted from the facet counts so an excluded Chat's Tags
   * don't count toward the Selection.
   */
  excludedTags: ReadonlyArray<ReadonlyArray<string>>;
}

/**
 * Derive each Tag's tri-state across the select-all-matching Selection. Returns
 * a state for every Tag in `tagCounts`; a Tag no matching Chat holds is `none`.
 */
export function selectAllTagStates({
  selectedCount,
  tagCounts,
  excludedTags,
}: SelectAllTagStateInput): Map<string, TagState> {
  // How many excluded Chats held each Tag — the amount to subtract from its
  // facet count so it reflects the remaining Selection.
  const excludedHolding = new Map<string, number>();
  for (const tags of excludedTags) {
    for (const tagId of tags) {
      excludedHolding.set(tagId, (excludedHolding.get(tagId) ?? 0) + 1);
    }
  }

  const states = new Map<string, TagState>();
  for (const [tagId, facetCount] of tagCounts) {
    const holding = Math.max(0, facetCount - (excludedHolding.get(tagId) ?? 0));
    if (selectedCount <= 0 || holding <= 0) {
      states.set(tagId, "none");
    } else if (holding >= selectedCount) {
      states.set(tagId, "all");
    } else {
      states.set(tagId, "some");
    }
  }
  return states;
}
