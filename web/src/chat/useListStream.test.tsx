import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useListStream, type ListStreamConnector } from "@/chat/useListStream";

// A connector test double: captures the handlers the hook wires up so the test
// can drive `changed`/`error` deterministically, and counts close() calls.
function fakeConnector() {
  let handlers: { onChanged: () => void; onError: () => void } | null = null;
  let closeCount = 0;
  let openCount = 0;
  const connect: ListStreamConnector = (h) => {
    handlers = h;
    openCount += 1;
    return {
      close() {
        closeCount += 1;
      },
    };
  };
  return {
    connect,
    emitChanged: () => handlers?.onChanged(),
    emitError: () => handlers?.onError(),
    get closeCount() {
      return closeCount;
    },
    get openCount() {
      return openCount;
    },
  };
}

describe("useListStream", () => {
  it("invokes the callback when the stream emits a changed event", () => {
    const fake = fakeConnector();
    const onChanged = vi.fn();

    renderHook(() => useListStream(onChanged, { connect: fake.connect }));

    act(() => fake.emitChanged());

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("closes the connection on unmount", () => {
    const fake = fakeConnector();
    const { unmount } = renderHook(() =>
      useListStream(vi.fn(), { connect: fake.connect })
    );
    expect(fake.openCount).toBe(1);

    unmount();

    expect(fake.closeCount).toBe(1);
  });

  it("opens no connection while disabled", () => {
    const fake = fakeConnector();
    renderHook(() =>
      useListStream(vi.fn(), { enabled: false, connect: fake.connect })
    );

    expect(fake.openCount).toBe(0);
  });

  describe("reconnection", () => {
    afterEach(() => vi.useRealTimers());

    it("reconnects after the connection drops", () => {
      vi.useFakeTimers();
      const fake = fakeConnector();
      renderHook(() => useListStream(vi.fn(), { connect: fake.connect }));
      expect(fake.openCount).toBe(1);

      // The connection drops; the hook closes it and reconnects after a backoff.
      act(() => fake.emitError());
      expect(fake.closeCount).toBe(1);
      act(() => vi.advanceTimersByTime(1000));

      expect(fake.openCount).toBe(2);
    });

    it("backs off exponentially across repeated drops", () => {
      vi.useFakeTimers();
      const fake = fakeConnector();
      renderHook(() => useListStream(vi.fn(), { connect: fake.connect }));

      // First drop reconnects after ~1s.
      act(() => fake.emitError());
      act(() => vi.advanceTimersByTime(1000));
      expect(fake.openCount).toBe(2);

      // Second drop waits longer (~2s): 1s is not yet enough.
      act(() => fake.emitError());
      act(() => vi.advanceTimersByTime(1000));
      expect(fake.openCount).toBe(2);
      act(() => vi.advanceTimersByTime(1000));
      expect(fake.openCount).toBe(3);
    });
  });
});
