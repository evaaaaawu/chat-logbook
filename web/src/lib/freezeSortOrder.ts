import type { Chat } from "@/types";

// Reorder a freshly-sorted list so that chats already known in `heldOrder` keep
// their held positions, ignoring the fresh sort. Background data changes (e.g. a
// bumped `updatedAt`) therefore never move rows under the user.
//
// Newly-appearing chats (present in `sortedFresh` but absent from `heldOrder`)
// are slotted in at the position the fresh sort gives them: each new chat lands
// just before the first held chat that follows it in the fresh order, and any
// new chats sorting after every held chat are appended at the end.
export function applyHeldOrder(
  sortedFresh: Chat[],
  heldOrder: string[]
): Chat[] {
  const byId = new Map(sortedFresh.map((c) => [c.id, c]));
  const heldSet = new Set(heldOrder);

  // Group new chats by the held chat they immediately precede in the fresh sort.
  const newBefore = new Map<string, Chat[]>();
  const trailing: Chat[] = [];
  let pending: Chat[] = [];
  for (const c of sortedFresh) {
    if (heldSet.has(c.id)) {
      if (pending.length > 0) {
        newBefore.set(c.id, pending);
        pending = [];
      }
    } else {
      pending.push(c);
    }
  }
  trailing.push(...pending);

  const result: Chat[] = [];
  for (const id of heldOrder) {
    const c = byId.get(id);
    if (!c) continue; // chat was removed since the order was frozen
    const inserts = newBefore.get(id);
    if (inserts) result.push(...inserts);
    result.push(c);
  }
  result.push(...trailing);
  return result;
}
