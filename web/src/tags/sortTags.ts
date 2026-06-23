import type { Tag } from "@/types";

// One shared A–Z ordering for every Tag surface (navigation panel, chat-list
// chips, conversation strip, find-or-create options) so they all read the same.
export function sortTagsByName(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}
