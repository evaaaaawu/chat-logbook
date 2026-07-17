import type { Tag } from "@/types";
import type { TagState } from "@/tags/TagPickerDialog";

// Derive each Tag's assignment state across the Selection from one grouped
// read (`/api/chats/batch/tags-by-chat`, #163 / ADR-0016): on every selected
// Chat → "all", on some → "some". A Tag on no selected Chat is absent from the
// result; the dialog treats a missing entry as "none". Membership only — Tag
// order within a Chat is irrelevant here.
export function deriveBatchTagStates(
  selectionSize: number,
  byChat: Record<string, Tag[]>
): Map<string, TagState> {
  const counts = new Map<string, number>();
  for (const tagsForChat of Object.values(byChat)) {
    for (const tag of tagsForChat) {
      counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
    }
  }
  const states = new Map<string, TagState>();
  for (const [tagId, count] of counts) {
    states.set(tagId, count >= selectionSize ? "all" : "some");
  }
  return states;
}
