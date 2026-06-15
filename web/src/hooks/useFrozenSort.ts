import { useState } from "react";
import type { Chat } from "@/types";
import { applyHeldOrder } from "@/lib/freezeSortOrder";
import { sortChats, type SortDirection, type SortField } from "@/lib/sortChats";

interface Anchor {
  key: string;
  ids: string[];
}

// Sort `chats`, but freeze the resulting row order across background data
// changes. The order is anchored when `resortKey` (or the sort field/direction)
// changes — a user-driven sort change, view switch, or data action — and held
// otherwise: background changes never move existing rows, while newly-appearing
// chats are slotted into their sorted position relative to the anchor (see
// applyHeldOrder).
export function useFrozenSort(
  chats: Chat[],
  field: SortField,
  direction: SortDirection,
  resortKey: string
): Chat[] {
  const fresh = sortChats(chats, field, direction);
  const key = `${field}:${direction}:${resortKey}`;

  // Store the anchored order in state and re-anchor when the key changes. This
  // is React's sanctioned "adjust state during render" pattern: setting state
  // during render bails out and re-renders immediately, so the freshly-sorted
  // order shows without a one-frame flicker.
  const [anchor, setAnchor] = useState<Anchor>(() => ({
    key,
    ids: fresh.map((c) => c.id),
  }));

  // Re-anchor on a key change, or when the current anchor is empty — the latter
  // covers the initial load, where the first render anchors before the fetch has
  // populated `chats`. Until a non-empty anchor is captured, freezing is a no-op.
  const needsAnchor = anchor.key !== key || anchor.ids.length === 0;
  if (needsAnchor) {
    const ids = fresh.map((c) => c.id);
    if (anchor.key !== key || ids.length !== anchor.ids.length) {
      setAnchor({ key, ids });
    }
    return fresh;
  }

  return applyHeldOrder(fresh, anchor.ids);
}
