import type { ScrollAnchor } from "./readingState";

/**
 * A Message's top edge in the virtualized column, keyed by its Normalized id.
 * Positions come from the virtualizer, not the DOM, so they mean the same thing
 * whatever order rows were measured in.
 */
export interface AnchorEntry {
  messageId: string;
  start: number;
}

/**
 * Turn a raw `scrollTop` into a message anchor: the topmost Message still at or
 * above the viewport top, plus how far into it the viewport has scrolled.
 *
 * Stored this way rather than as a pixel `scrollTop` because the pane
 * virtualizes with estimated heights — a raw offset means something different
 * on every load depending on measurement order and which rows are open — and an
 * anchor survives the chat gaining or losing messages between visits (#239).
 *
 * Returns null when there is nothing to anchor to (an empty column).
 */
export function pickAnchor({
  scrollTop,
  entries,
}: {
  scrollTop: number;
  entries: readonly AnchorEntry[];
}): ScrollAnchor | null {
  let anchor: AnchorEntry | null = null;
  for (const entry of entries) {
    if (entry.start <= scrollTop) anchor = entry;
    else break;
  }
  // Nothing starts at or above the viewport top (e.g. scrolled above the first
  // row): fall back to the first entry so restore still has a target.
  if (!anchor) anchor = entries[0] ?? null;
  if (!anchor) return null;
  return { messageId: anchor.messageId, offset: scrollTop - anchor.start };
}

/**
 * Find the list position of a stored anchor's Message, so restore can scroll to
 * it by index — the one primitive that re-measures estimated heights until the
 * row truly lands at the top.
 *
 * Returns null when there is no anchor, or when its Message no longer exists —
 * the chat lost it between visits — so the caller degrades to landing at the
 * bottom rather than erroring (#239).
 */
export function resolveAnchorIndex(
  anchor: ScrollAnchor | null,
  messages: readonly { id: string }[]
): number | null {
  if (!anchor) return null;
  const index = messages.findIndex((m) => m.id === anchor.messageId);
  return index === -1 ? null : index;
}
