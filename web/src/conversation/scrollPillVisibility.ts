export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

// Where the (single) scroll pill would take you if tapped. Chat logs anchor on
// the latest message, so whenever you are away from the bottom the pill offers
// "jump to latest"; only once pinned at the bottom does it offer "back to top".
// null hides the pill (content too short to scroll). This mirrors the single
// contextual button in Slack / Discord / ChatGPT.
export type ScrollPillTarget = "top" | "bottom" | null;

// A few pixels of slack so sub-pixel scroll offsets and fractional layout
// heights still register as "pinned to the edge" rather than mid-scroll.
const EDGE_THRESHOLD = 8;

export function getScrollPillTarget(
  { scrollTop, scrollHeight, clientHeight }: ScrollMetrics,
  threshold: number = EDGE_THRESHOLD
): ScrollPillTarget {
  const scrollable = scrollHeight - clientHeight > threshold;
  if (!scrollable) return null;

  const atBottom = scrollTop + clientHeight >= scrollHeight - threshold;
  return atBottom ? "top" : "bottom";
}
