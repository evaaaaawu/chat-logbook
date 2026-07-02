import { useState } from "react";
import type { Chat } from "@/types";
import { applyHeldOrder } from "@/chat/sort/freezeSortOrder";
import {
  sortChats,
  type SortDirection,
  type SortField,
} from "@/chat/sort/sortChats";

interface Anchor {
  key: string;
  ids: string[];
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// Sort `chats`, but freeze the resulting row order across background data
// changes. The order is anchored when `resortKey` (or the sort field/direction)
// changes — a user-driven sort change, view switch, or data action — and held
// otherwise: background changes never move existing rows.
//
// The anchor freezes the whole loaded window, not just the first page. As new
// chats appear (a fetched next page, or background ingestion), each is slotted
// into its sorted position relative to the held rows (see applyHeldOrder) and
// then folded into the anchor, so a later refresh holds it where it first
// landed rather than re-sorting it under the user.
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
  // during render bails out and re-renders immediately, so the new order shows
  // without a one-frame flicker.
  const [anchor, setAnchor] = useState<Anchor>(() => ({
    key,
    ids: fresh.map((c) => c.id),
  }));

  // A key change is an explicit re-sort: drop the held window and re-anchor to
  // the fresh order.
  if (anchor.key !== key) {
    setAnchor({ key, ids: fresh.map((c) => c.id) });
    return fresh;
  }

  // Same key: hold existing rows, slot newcomers by the fresh sort. This also
  // covers the initial load, where the first render anchors an empty window
  // before the fetch resolves and the first page then grows it.
  const held = applyHeldOrder(fresh, anchor.ids);
  const heldIds = held.map((c) => c.id);

  // Grow (or shrink) the anchor to match the held window so slotted newcomers —
  // and the removal of any departed rows — persist into the next render.
  // Without this the anchor stays stuck on the first page and later refreshes
  // would re-slot rows that have already been placed.
  if (!sameIds(heldIds, anchor.ids)) {
    setAnchor({ key, ids: heldIds });
  }

  return held;
}
