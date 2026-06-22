import type { Chat } from "@/types";

/**
 * Keep chats in any of the selected Projects (OR / union). An empty selection
 * means "all Projects" and returns every chat unchanged. The empty-string entry
 * selects the `(No project)` group. Pure: preserves input order, never mutates.
 */
export function filterChatsByProjects(
  chats: Chat[],
  selected: ReadonlySet<string>
): Chat[] {
  if (selected.size === 0) return chats;
  return chats.filter((c) => selected.has(c.project));
}
