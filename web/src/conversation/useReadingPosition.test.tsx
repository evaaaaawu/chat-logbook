import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useReadingPosition,
  type RenderedMessage,
} from "@/conversation/useReadingPosition";
import type {
  ScrollAlign,
  ScrollMetrics,
  ScrollSurface,
  VirtualItem,
} from "@/conversation/scrollSurface";
import type { ReadingStateController } from "@/conversation/useReadingState";
import type { ReadingState } from "@/conversation/readingState";

/**
 * A scrollable column with no DOM behind it: it records what was asked of it,
 * and reports whatever geometry the test sets. `afterFrame` callbacks queue up
 * until `runFrames`, so a test can watch the two-step restore (jump, then nudge
 * once the row has landed) with nothing to wait on.
 */
function fakeSurface(geometry: ScrollMetrics | null = null) {
  const jumps: { index: number; align: ScrollAlign }[] = [];
  const nudges: number[] = [];
  let frames: (() => void)[] = [];
  let viewport = geometry;
  let items: VirtualItem[] = [];

  const surface: ScrollSurface = {
    scrollToIndex(index, opts) {
      jumps.push({ index, align: opts.align });
    },
    getVirtualItems: () => items,
    getViewport: () => viewport,
    nudgeBy(delta) {
      nudges.push(delta);
    },
    afterFrame(cb) {
      frames.push(cb);
      return () => {
        frames = frames.filter((f) => f !== cb);
      };
    },
  };

  return {
    surface,
    jumps,
    nudges,
    get lastJump() {
      return jumps[jumps.length - 1];
    },
    setViewport(next: ScrollMetrics | null) {
      viewport = next;
    },
    setItems(next: VirtualItem[]) {
      items = next;
    },
    runFrames() {
      const queued = frames;
      frames = [];
      for (const cb of queued) cb();
    },
  };
}

function fakeReading(
  initial: ReadingState | null = null
): ReadingStateController {
  return {
    initial,
    recordAnchor: vi.fn(),
    recordOpenRows: vi.fn(),
    flush: vi.fn(),
  };
}

// Geometry for a column three viewports tall: scrolled to 0 is scrolled up,
// scrolled to 700 is pinned to the bottom.
const TALL = { scrollHeight: 1000, clientHeight: 300 };
const scrolledUp: ScrollMetrics = { scrollTop: 0, ...TALL };
const atBottom: ScrollMetrics = { scrollTop: 700, ...TALL };

function messages(count: number): RenderedMessage[] {
  return Array.from({ length: count }, (_, i) => ({ id: `m-${i + 1}` }));
}

/** A rendered list spelled out message by message, for the filtering cases. */
function list(...ids: string[]): RenderedMessage[] {
  return ids.map((id) => ({ id }));
}

interface Props {
  chatId: string | undefined;
  messages: readonly RenderedMessage[];
  loading?: boolean;
  contentHeight?: number;
}

function mount(
  props: Props,
  {
    surface,
    reading = fakeReading(),
  }: {
    surface: ReturnType<typeof fakeSurface>;
    reading?: ReadingStateController;
  }
) {
  return renderHook(
    (p: Props) =>
      useReadingPosition({
        chatId: p.chatId,
        messages: p.messages,
        loading: p.loading ?? false,
        contentHeight: p.contentHeight ?? 1000,
        reading,
        surface: surface.surface,
      }),
    { initialProps: props }
  );
}

describe("landing on a chat", () => {
  it("lands at the latest message on a first visit", () => {
    const surface = fakeSurface(atBottom);

    mount({ chatId: "c1", messages: messages(3) }, { surface });

    expect(surface.lastJump).toEqual({ index: 2, align: "end" });
  });

  it("waits for the chat's own messages before landing", () => {
    const surface = fakeSurface(atBottom);
    // A chat switch: `messages` still holds the outgoing chat's turns (#239).
    const { rerender } = mount(
      { chatId: "c2", messages: messages(3), loading: true },
      { surface }
    );

    expect(surface.jumps).toEqual([]);

    act(() =>
      rerender({ chatId: "c2", messages: messages(9), loading: false })
    );

    expect(surface.jumps).toEqual([{ index: 8, align: "end" }]);
  });

  it("lands once, and does not re-land as the chat is re-read", () => {
    const surface = fakeSurface(atBottom);
    const { rerender } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface }
    );

    act(() => rerender({ chatId: "c1", messages: messages(3) }));

    expect(surface.jumps).toHaveLength(1);
  });

  it("measures the pill once the landing jump has settled", () => {
    const surface = fakeSurface(atBottom);
    const { result } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface }
    );

    act(() => surface.runFrames());

    // Pinned at the bottom, the pill offers the way back to the top.
    expect(result.current.scrollPill).toBe("top");
  });
});

describe("restoring where the reader left off", () => {
  it("scrolls to the remembered message and nudges into it", () => {
    const surface = fakeSurface(atBottom);
    const reading = fakeReading({
      anchor: { messageId: "m-2", offset: 30 },
      openRows: [],
    });

    mount({ chatId: "c1", messages: messages(3) }, { surface, reading });

    expect(surface.lastJump).toEqual({ index: 1, align: "start" });
    // The within-message offset waits for the row to land before it applies.
    expect(surface.nudges).toEqual([]);

    act(() => surface.runFrames());

    expect(surface.nudges).toEqual([30]);
  });

  it("lands at the bottom when the remembered message is gone", () => {
    const surface = fakeSurface(atBottom);
    const reading = fakeReading({
      anchor: { messageId: "m-gone", offset: 30 },
      openRows: [],
    });

    mount({ chatId: "c1", messages: messages(3) }, { surface, reading });
    act(() => surface.runFrames());

    expect(surface.jumps).toEqual([{ index: 2, align: "end" }]);
    expect(surface.nudges).toEqual([]);
  });

  it("skips the nudge when the reader left off at a message's top edge", () => {
    const surface = fakeSurface(atBottom);
    const reading = fakeReading({
      anchor: { messageId: "m-3", offset: 0 },
      openRows: [],
    });

    mount({ chatId: "c1", messages: messages(3) }, { surface, reading });
    act(() => surface.runFrames());

    expect(surface.lastJump).toEqual({ index: 2, align: "start" });
    expect(surface.nudges).toEqual([]);
  });

  it("still nudges when the chat is re-read in the frame after landing", () => {
    // The restore finishes a frame later, and the Messages array changes
    // identity on every re-read. Tying the frame to the effect run that
    // scheduled it would cancel the nudge here, silently.
    const surface = fakeSurface(atBottom);
    const reading = fakeReading({
      anchor: { messageId: "m-2", offset: 30 },
      openRows: [],
    });
    const { rerender } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface, reading }
    );

    // A re-read that changed nothing lands between the jump and the frame.
    act(() => rerender({ chatId: "c1", messages: messages(3) }));
    act(() => surface.runFrames());

    expect(surface.nudges).toEqual([30]);
  });

  it("restores against the chat's own messages, never the outgoing chat's", () => {
    const surface = fakeSurface(atBottom);
    // "m-2" exists in the outgoing chat's list too, so restoring while the
    // fetch is in flight would land on the wrong turn.
    const reading = fakeReading({
      anchor: { messageId: "m-2", offset: 0 },
      openRows: [],
    });
    const { rerender } = mount(
      { chatId: "c2", messages: messages(3), loading: true },
      { surface, reading }
    );

    expect(surface.jumps).toEqual([]);

    act(() =>
      rerender({ chatId: "c2", messages: messages(9), loading: false })
    );

    expect(surface.jumps).toEqual([{ index: 1, align: "start" }]);
  });
});

describe("capturing the reading position as the reader scrolls", () => {
  it("records the topmost visible message and how far into it", () => {
    const surface = fakeSurface({ scrollTop: 130, ...TALL });
    surface.setItems([
      { index: 0, start: 0 },
      { index: 1, start: 100 },
      { index: 2, start: 260 },
    ]);
    const reading = fakeReading();
    const { result } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface, reading }
    );

    act(() => result.current.onScroll());

    expect(reading.recordAnchor).toHaveBeenLastCalledWith({
      messageId: "m-2",
      offset: 30,
    });
  });

  it("updates which way the pill points as the reader moves", () => {
    const surface = fakeSurface(atBottom);
    const { result } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface }
    );

    act(() => surface.runFrames());
    expect(result.current.scrollPill).toBe("top");

    surface.setViewport(scrolledUp);
    act(() => result.current.onScroll());

    expect(result.current.scrollPill).toBe("bottom");
  });

  it("hides the pill when there is nothing to scroll", () => {
    const surface = fakeSurface({
      scrollTop: 0,
      scrollHeight: 300,
      clientHeight: 300,
    });
    const { result } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface }
    );

    act(() => result.current.onScroll());

    expect(result.current.scrollPill).toBeNull();
  });
});

describe("jumping", () => {
  it("jumps to the first and last message by index", () => {
    const surface = fakeSurface(atBottom);
    const { result } = mount(
      { chatId: "c1", messages: messages(5) },
      { surface }
    );

    act(() => result.current.onJumpTop());
    expect(surface.lastJump).toEqual({ index: 0, align: "start" });

    act(() => result.current.onJumpBottom());
    expect(surface.lastJump).toEqual({ index: 4, align: "end" });
  });
});

describe("messages arriving while the chat is open", () => {
  function mountScrolledUp(surface: ReturnType<typeof fakeSurface>) {
    const mounted = mount({ chatId: "c1", messages: messages(3) }, { surface });
    act(() => surface.runFrames());
    // Scroll away from the bottom, which is what makes an arrival unread.
    surface.setViewport(scrolledUp);
    act(() => mounted.result.current.onScroll());
    return mounted;
  }

  it("marks the first unseen message and holds the viewport", () => {
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mountScrolledUp(surface);
    const jumpsBefore = surface.jumps.length;

    act(() => rerender({ chatId: "c1", messages: messages(4) }));

    expect(result.current.unread.dividerIndex).toBe(3);
    expect(result.current.unread.pillVisible).toBe(true);
    expect(surface.jumps).toHaveLength(jumpsBefore);
  });

  it("freezes the divider, so later arrivals do not move it", () => {
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mountScrolledUp(surface);

    act(() => rerender({ chatId: "c1", messages: messages(4) }));
    act(() => rerender({ chatId: "c1", messages: messages(6) }));

    expect(result.current.unread.dividerIndex).toBe(3);
  });

  it("follows the latest with no divider when pinned to the bottom", () => {
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface }
    );
    act(() => surface.runFrames());

    act(() => rerender({ chatId: "c1", messages: messages(4) }));

    expect(result.current.unread.dividerIndex).toBeNull();
    expect(surface.lastJump).toEqual({ index: 3, align: "end" });
  });

  it("does nothing when the count did not grow", () => {
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mountScrolledUp(surface);
    const jumpsBefore = surface.jumps.length;

    // A re-read that changed nothing, and then one that lost a message.
    act(() => rerender({ chatId: "c1", messages: messages(3) }));
    act(() => rerender({ chatId: "c1", messages: messages(2) }));

    expect(result.current.unread.dividerIndex).toBeNull();
    expect(surface.jumps).toHaveLength(jumpsBefore);
  });

  it("notices an arrival that leaves the count unchanged", () => {
    // A turn stops rendering in the same read that brings a new one, so the
    // list is as long as it was. Counting says nothing happened; the identity
    // of the last Message says otherwise (#271).
    const surface = fakeSurface(atBottom);
    const mounted = mount({ chatId: "c1", messages: messages(3) }, { surface });
    act(() => surface.runFrames());
    surface.setViewport(scrolledUp);
    act(() => mounted.result.current.onScroll());

    act(() =>
      mounted.rerender({ chatId: "c1", messages: list("m-1", "m-3", "m-4") })
    );

    expect(mounted.result.current.unread.dividerIndex).toBe(2);
    expect(mounted.result.current.unread.pillVisible).toBe(true);
  });

  it("counts against what is on screen, even after the chat emptied", () => {
    // The baseline is written on every run, so a chat that empties and refills
    // compares against the empty column rather than a count from before it
    // (#270). Emptied, the column is not scrollable, so the reader is at the
    // bottom and the refill is followed rather than flagged.
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mount(
      { chatId: "c1", messages: messages(3) },
      { surface }
    );
    act(() => surface.runFrames());

    surface.setViewport({ scrollTop: 0, scrollHeight: 0, clientHeight: 300 });
    act(() => rerender({ chatId: "c1", messages: [], contentHeight: 0 }));
    surface.setViewport(atBottom);
    act(() => rerender({ chatId: "c1", messages: messages(3) }));

    expect(result.current.unread.dividerIndex).toBeNull();
    expect(surface.lastJump).toEqual({ index: 2, align: "end" });
  });

  it("clears the divider as the chat changes, not once its messages land", () => {
    // The switch stays in flight for a while, and `messages` still holds the
    // outgoing chat's turns throughout. The divider is the old chat's, so it
    // goes the moment the chat does — waiting for the fetch would leave it
    // pointing into a chat that is no longer on screen.
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mountScrolledUp(surface);
    act(() => rerender({ chatId: "c1", messages: messages(4) }));
    expect(result.current.unread.dividerIndex).toBe(3);

    act(() => rerender({ chatId: "c2", messages: messages(4), loading: true }));

    expect(result.current.unread.dividerIndex).toBeNull();
    expect(result.current.unread.pillVisible).toBe(false);
  });

  it("clears the divider and the pill when a different chat opens", () => {
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mountScrolledUp(surface);
    act(() => rerender({ chatId: "c1", messages: messages(4) }));
    expect(result.current.unread.dividerIndex).toBe(3);

    act(() => rerender({ chatId: "c2", messages: messages(2) }));

    expect(result.current.unread.dividerIndex).toBeNull();
    expect(result.current.unread.pillVisible).toBe(false);
  });
});

describe("the unread pill", () => {
  function mountWithUnread(surface: ReturnType<typeof fakeSurface>) {
    const mounted = mount({ chatId: "c1", messages: messages(3) }, { surface });
    act(() => surface.runFrames());
    surface.setViewport(scrolledUp);
    act(() => mounted.result.current.onScroll());
    act(() => mounted.rerender({ chatId: "c1", messages: messages(4) }));
    return mounted;
  }

  it("jumps to the divider, not the bottom, and consumes itself", () => {
    const surface = fakeSurface(atBottom);
    const { result } = mountWithUnread(surface);

    act(() => result.current.unread.onJump());

    expect(surface.lastJump).toEqual({ index: 3, align: "start" });
    expect(result.current.unread.pillVisible).toBe(false);
    // The divider stays put — it is where the reader left off, not a toast.
    expect(result.current.unread.dividerIndex).toBe(3);
  });

  it("stays on its own message when an earlier turn stops rendering", () => {
    // The divider marks m-4. A later read drops m-1, which shifts every
    // position beneath it — an index would keep pointing one Message too far
    // down, in front of something already read (#271).
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mountWithUnread(surface);
    expect(result.current.unread.dividerIndex).toBe(3);

    act(() => rerender({ chatId: "c1", messages: list("m-2", "m-3", "m-4") }));

    expect(result.current.unread.dividerIndex).toBe(2);
    expect(result.current.unread.pillVisible).toBe(true);
  });

  it("shows no divider at all once its message is gone", () => {
    const surface = fakeSurface(atBottom);
    const { result, rerender } = mountWithUnread(surface);

    act(() => rerender({ chatId: "c1", messages: list("m-1", "m-2", "m-3") }));

    expect(result.current.unread.dividerIndex).toBeNull();
    expect(result.current.unread.pillVisible).toBe(false);
  });

  it("consumes itself when the reader scrolls back to the bottom", () => {
    const surface = fakeSurface(atBottom);
    const { result } = mountWithUnread(surface);
    expect(result.current.unread.pillVisible).toBe(true);

    surface.setViewport(atBottom);
    act(() => result.current.onScroll());

    expect(result.current.unread.pillVisible).toBe(false);
    expect(result.current.unread.dividerIndex).toBe(3);
  });
});

describe("with no chat open", () => {
  it("does not scroll, and lands again when a chat opens", () => {
    const surface = fakeSurface(atBottom);
    const { rerender } = mount(
      { chatId: undefined, messages: [] },
      { surface }
    );

    expect(surface.jumps).toEqual([]);

    act(() => rerender({ chatId: "c1", messages: messages(3) }));

    expect(surface.lastJump).toEqual({ index: 2, align: "end" });
  });
});
