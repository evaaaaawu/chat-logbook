import type { ArrivalAction } from "@/conversation/liveArrival";

/**
 * Where the unread divider sits: the index of the first message the reader has
 * not seen (issue #189). `null` means no divider — the reader is caught up.
 *
 * The rule is set-once-then-freeze. The first time messages arrive while
 * scrolled up (`flag`), the divider anchors before the first new message —
 * which is exactly the count that was on screen before, `prevLen`. Later
 * arrivals leave it put, so the marker keeps pointing at where the reader
 * actually left off rather than chasing the newest message. `follow` (arrivals
 * while pinned to the bottom) and `none` never introduce a divider. Clearing on
 * chat change is the caller's concern, not this pure step.
 */
export function deriveFirstUnseenIndex({
  current,
  action,
  prevLen,
}: {
  current: number | null;
  action: ArrivalAction;
  prevLen: number;
}): number | null {
  if (action === "flag" && current === null) return prevLen;
  return current;
}
