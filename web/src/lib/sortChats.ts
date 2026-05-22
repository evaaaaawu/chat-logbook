import type { Chat } from "@/types";

export type SortField = "title" | "createdAt" | "updatedAt";
export type SortDirection = "asc" | "desc";

function isEmptyTitle(title: string | null | undefined): boolean {
  return title == null || title.trim() === "";
}

function compareTitle(a: Chat, b: Chat, direction: SortDirection): number {
  const aEmpty = isEmptyTitle(a.title);
  const bEmpty = isEmptyTitle(b.title);
  // Empty/null titles always sink to the bottom, regardless of direction.
  if (aEmpty || bEmpty) return Number(aEmpty) - Number(bEmpty);
  const cmp = a.title.localeCompare(b.title, "zh-Hant", {
    sensitivity: "base",
    numeric: true,
  });
  return direction === "asc" ? cmp : -cmp;
}

function comparePrimary(
  a: Chat,
  b: Chat,
  field: SortField,
  direction: SortDirection
): number {
  if (field === "title") return compareTitle(a, b, direction);
  const cmp = a[field] - b[field];
  return direction === "asc" ? cmp : -cmp;
}

function compareTieBreakers(a: Chat, b: Chat): number {
  return (
    b.updatedAt - a.updatedAt ||
    b.createdAt - a.createdAt ||
    a.id.localeCompare(b.id)
  );
}

export function sortChats(
  chats: Chat[],
  field: SortField,
  direction: SortDirection
): Chat[] {
  return [...chats].sort(
    (a, b) => comparePrimary(a, b, field, direction) || compareTieBreakers(a, b)
  );
}
