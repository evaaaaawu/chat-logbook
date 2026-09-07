/**
 * A row the virtualizer is currently rendering, with its top edge in the
 * column. Positions come from the virtualizer, not the DOM, so they mean the
 * same thing whatever order rows were measured in.
 */
export interface VirtualItem {
  index: number;
  start: number;
}

/** Which edge of the viewport a scrolled-to row lands against. */
export type ScrollAlign = "start" | "end";

/** A snapshot of where the viewport sits and how much there is to scroll. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * The scrollable column, as the conversation pane needs to talk to it.
 *
 * Everything the pane does to the scroll position — measuring the pill,
 * capturing the reading position, the three jumps, landing and restoring —
 * goes through this one seam rather than reaching for the virtualizer or the
 * container's node. That is what makes the behavior replaceable in a test
 * without standing up the whole pane against a hand-built geometry stub (#269).
 */
export interface ScrollSurface {
  /** Scroll row `index` to the top ("start") or bottom ("end") of the viewport. */
  scrollToIndex(index: number, opts: { align: ScrollAlign }): void;
  /** The rows currently rendered, each with its top edge in the column. */
  getVirtualItems(): VirtualItem[];
  /** Where the viewport sits, or null before the container is mounted. */
  getViewport(): ScrollMetrics | null;
  /** Shift the viewport by `delta` pixels from where it sits now. */
  nudgeBy(delta: number): void;
  /** Run after the next frame, once the virtualizer has re-measured. Returns a cancel. */
  afterFrame(cb: () => void): () => void;
}

/**
 * The part of TanStack Virtual's virtualizer the surface uses. Named
 * structurally rather than imported so a test can hand in a plain object.
 */
export interface VirtualScroller {
  scrollToIndex(index: number, opts: { align: ScrollAlign }): void;
  getVirtualItems(): VirtualItem[];
}

/** The part of the scroll container the surface touches. */
export type ScrollContainer = Pick<
  HTMLElement,
  "scrollTop" | "scrollHeight" | "clientHeight"
>;

/**
 * Build a surface over a virtualizer and its scroll container.
 *
 * The container comes in as a getter because the ref holding it is null until
 * mount, and stays the same node afterwards. The virtualizer is a value: its
 * React adapter keeps one instance in state for the life of the component, so
 * there is nothing to re-read.
 */
export function createScrollSurface({
  scroller,
  getContainer,
}: {
  scroller: VirtualScroller;
  getContainer: () => ScrollContainer | null;
}): ScrollSurface {
  return {
    scrollToIndex(index, opts) {
      scroller.scrollToIndex(index, opts);
    },
    getVirtualItems() {
      return scroller.getVirtualItems();
    },
    getViewport() {
      const el = getContainer();
      if (!el) return null;
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    },
    nudgeBy(delta) {
      const el = getContainer();
      if (el) el.scrollTop += delta;
    },
    afterFrame(cb) {
      // Waiting a frame for estimated heights to settle is a property of the
      // scrollable column, not of the code deciding where to scroll, so it
      // lives here with the rest of the machinery.
      const raf = requestAnimationFrame(cb);
      return () => cancelAnimationFrame(raf);
    },
  };
}
