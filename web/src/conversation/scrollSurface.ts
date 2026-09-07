/**
 * The scrollable column, as the conversation pane needs to talk to it.
 *
 * Everything the pane does to the scroll position — measuring the pill,
 * capturing the reading position, the three jumps, landing and restoring —
 * goes through this one seam, so none of it reaches past to the virtualizer or
 * the container's DOM node. That is what makes the behaviour replaceable in a
 * test without standing up the whole pane against a hand-built geometry stub
 * (#269).
 */
export interface ScrollSurface {
  /** Scroll row `index` to the top ("start") or bottom ("end") of the viewport. */
  scrollToIndex(index: number, opts: { align: "start" | "end" }): void;
  /** The rows currently rendered, each with its top edge in the column. */
  getVirtualItems(): { index: number; start: number }[];
  /** The viewport's geometry, or null before the container is mounted. */
  getViewport(): {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null;
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
  scrollToIndex(index: number, opts: { align: "start" | "end" }): void;
  getVirtualItems(): { index: number; start: number }[];
}

/**
 * Build a surface over a virtualizer and its scroll container.
 *
 * Both come in as getters: the virtualizer is a fresh object on every render
 * and the container ref is null until mount, so reading them per call is what
 * lets one surface outlive both.
 */
export function createScrollSurface({
  getScroller,
  getElement,
}: {
  getScroller: () => VirtualScroller;
  getElement: () => HTMLElement | null;
}): ScrollSurface {
  return {
    scrollToIndex(index, opts) {
      getScroller().scrollToIndex(index, opts);
    },
    getVirtualItems() {
      return getScroller().getVirtualItems();
    },
    getViewport() {
      const el = getElement();
      if (!el) return null;
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    },
    nudgeBy(delta) {
      const el = getElement();
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
