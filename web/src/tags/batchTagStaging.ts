import type { TagState } from "@/tags/TagPickerDialog";

// Staged batch Tag edits (#163). The dialog stages add/remove intents rather
// than mutating on each click; `Done` applies the accumulated diff in one call.
// A staged entry holds the row's *displayed* target state, overriding the tag's
// initial state (its tri-state across the Selection). Missing = untouched.
export type StagedTagEdits = ReadonlyMap<string, TagState>;

// Click semantics are fixed (not a free tri-state cycle): a row on some/none
// stages to add-all ("all"); a row on all stages to remove-all ("none").
// Re-clicking flips between those two poles, so a double-click lands back on
// the initial state and drops out of the diff.
export function toggleStaged(
  staged: StagedTagEdits,
  initial: TagState,
  tagId: string
): StagedTagEdits {
  const current = staged.get(tagId) ?? initial;
  const next: TagState = current === "all" ? "none" : "all";
  const copy = new Map(staged);
  copy.set(tagId, next);
  return copy;
}

// The state to render for a row: the staged override if the user touched it,
// otherwise its initial tri-state (missing initial = "none").
export function displayStateFor(
  staged: StagedTagEdits,
  initialStates: ReadonlyMap<string, TagState>,
  tagId: string
): TagState {
  return staged.get(tagId) ?? initialStates.get(tagId) ?? "none";
}

// The net add/remove diff to send on `Done`: only tags whose staged state
// differs from their initial state. A tag moved to "all" is an add across the
// Selection; moved to "none" is a remove. An untouched "some" contributes
// nothing.
export function batchTagDiff(
  staged: StagedTagEdits,
  initialStates: ReadonlyMap<string, TagState>
): { add: string[]; remove: string[] } {
  const add: string[] = [];
  const remove: string[] = [];
  for (const [tagId, display] of staged) {
    const initial = initialStates.get(tagId) ?? "none";
    if (display === initial) continue;
    if (display === "all") add.push(tagId);
    else if (display === "none") remove.push(tagId);
  }
  return { add, remove };
}
