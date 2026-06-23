import { UNTAGGED } from "@/tags/filterChatsByTags";

/**
 * Toggle one entry in the Tag filter selection while keeping a single
 * invariant: the `Untagged` group and real Tags are mutually exclusive. They
 * can never co-occur because "holds no Tag" and "holds Tag X" can't both be
 * true — a combined selection would always yield zero chats, a dead end. So:
 *
 * - Toggling `Untagged` on clears every real Tag (result is just `{UNTAGGED}`);
 *   toggling it off clears the selection.
 * - Toggling any real Tag clears `Untagged` first, then adds/removes that Tag.
 *
 * Pure: returns a new Set, never mutates the input.
 */
export function toggleTagSelection(
  selected: ReadonlySet<string>,
  tagId: string
): Set<string> {
  if (tagId === UNTAGGED) {
    return selected.has(UNTAGGED) ? new Set() : new Set([UNTAGGED]);
  }
  const next = new Set(selected);
  next.delete(UNTAGGED);
  if (next.has(tagId)) next.delete(tagId);
  else next.add(tagId);
  return next;
}
