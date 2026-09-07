import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createScrollSurface,
  type ScrollContainer,
  type VirtualItem,
  type VirtualScroller,
} from "./scrollSurface";

function fakeScroller(overrides: Partial<VirtualScroller> = {}) {
  return {
    scrollToIndex: vi.fn(),
    getVirtualItems: vi.fn(() => [] as VirtualItem[]),
    ...overrides,
  };
}

// A stand-in for the scroll container: only the three geometry reads and the
// writable scrollTop the surface actually touches.
function fakeContainer(geometry: ScrollContainer): ScrollContainer {
  return { ...geometry };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createScrollSurface", () => {
  it("scrolls to an index through the virtualizer", () => {
    const scroller = fakeScroller();
    const surface = createScrollSurface({
      scroller,
      getContainer: () => null,
    });

    surface.scrollToIndex(4, { align: "end" });

    expect(scroller.scrollToIndex).toHaveBeenCalledWith(4, { align: "end" });
  });

  it("reports the rendered rows as index and top edge", () => {
    const scroller = fakeScroller({
      getVirtualItems: vi.fn(() => [
        { index: 0, start: 0 },
        { index: 1, start: 120 },
      ]),
    });
    const surface = createScrollSurface({
      scroller,
      getContainer: () => null,
    });

    expect(surface.getVirtualItems()).toEqual([
      { index: 0, start: 0 },
      { index: 1, start: 120 },
    ]);
  });

  it("reports the viewport geometry", () => {
    const el = fakeContainer({
      scrollTop: 40,
      scrollHeight: 1000,
      clientHeight: 300,
    });
    const surface = createScrollSurface({
      scroller: fakeScroller(),
      getContainer: () => el,
    });

    expect(surface.getViewport()).toEqual({
      scrollTop: 40,
      scrollHeight: 1000,
      clientHeight: 300,
    });
  });

  it("returns no viewport before the container is mounted", () => {
    const surface = createScrollSurface({
      scroller: fakeScroller(),
      getContainer: () => null,
    });

    expect(surface.getViewport()).toBeNull();
  });

  it("nudges the viewport by a delta", () => {
    const el = fakeContainer({
      scrollTop: 40,
      scrollHeight: 1000,
      clientHeight: 300,
    });
    const surface = createScrollSurface({
      scroller: fakeScroller(),
      getContainer: () => el,
    });

    surface.nudgeBy(15);

    expect(el.scrollTop).toBe(55);
  });

  it("ignores a nudge with no container to nudge", () => {
    const surface = createScrollSurface({
      scroller: fakeScroller(),
      getContainer: () => null,
    });

    expect(() => surface.nudgeBy(15)).not.toThrow();
  });

  it("runs the callback on the next frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const surface = createScrollSurface({
      scroller: fakeScroller(),
      getContainer: () => null,
    });
    const cb = vi.fn();

    surface.afterFrame(cb);
    expect(cb).not.toHaveBeenCalled();
    frames[0](0);

    expect(cb).toHaveBeenCalledOnce();
  });

  it("cancels a pending frame", () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", () => 7);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const surface = createScrollSurface({
      scroller: fakeScroller(),
      getContainer: () => null,
    });

    surface.afterFrame(vi.fn())();

    expect(cancel).toHaveBeenCalledWith(7);
  });
});
