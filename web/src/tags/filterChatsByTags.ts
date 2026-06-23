import type { Chat } from "@/types";

/**
 * The sentinel selection entry for the `Untagged` group (Chats holding zero
 * Tags). Matches the API/reader convention where an empty-string entry selects
 * the no-Tag bucket, so the navigation panel and the wire form read the same.
 */
export const UNTAGGED = "";

/**
 * Keep chats holding ALL of the selected Tags (AND / intersection) — the
 * asymmetric counterpart to the Project filter's OR. An empty selection means
 * "all Tags" and returns every chat unchanged. The `UNTAGGED` entry selects
 * Chats with no Tags; combined with a real Tag it naturally yields nothing.
 * Pure: preserves input order, never mutates.
 */
export function filterChatsByTags(
  chats: Chat[],
  selected: ReadonlySet<string>
): Chat[] {
  if (selected.size === 0) return chats;
  const realTagIds = [...selected].filter((id) => id !== UNTAGGED);
  const wantUntagged = selected.has(UNTAGGED);
  return chats.filter((chat) => {
    const tagIds = new Set((chat.tags ?? []).map((t) => t.id));
    if (wantUntagged && tagIds.size > 0) return false;
    return realTagIds.every((id) => tagIds.has(id));
  });
}
