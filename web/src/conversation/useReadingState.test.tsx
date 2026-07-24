import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReadingState } from "./useReadingState";
import { loadReadingState, saveReadingState } from "./readingState";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useReadingState", () => {
  it("loads the stored state for the chat as its initial value", () => {
    saveReadingState("chat-1", {
      anchor: { messageId: "m-5", offset: 8 },
      openRows: ["m-1:0"],
    });

    const { result } = renderHook(() => useReadingState("chat-1"));

    expect(result.current.initial).toEqual({
      anchor: { messageId: "m-5", offset: 8 },
      openRows: ["m-1:0"],
    });
  });

  it("debounces writes, saving once with the latest anchor", () => {
    const { result } = renderHook(() =>
      useReadingState("chat-1", { debounceMs: 500 })
    );

    act(() => {
      result.current.recordAnchor({ messageId: "m-1", offset: 0 });
      result.current.recordAnchor({ messageId: "m-2", offset: 40 });
    });

    // Nothing written until the debounce elapses.
    expect(loadReadingState("chat-1")).toBeNull();

    act(() => vi.advanceTimersByTime(500));

    expect(loadReadingState("chat-1")?.anchor).toEqual({
      messageId: "m-2",
      offset: 40,
    });
  });

  it("combines the latest anchor and open rows into one saved state", () => {
    const { result } = renderHook(() =>
      useReadingState("chat-1", { debounceMs: 500 })
    );

    act(() => {
      result.current.recordAnchor({ messageId: "m-2", offset: 40 });
      result.current.recordOpenRows(["m-2:1"]);
      vi.advanceTimersByTime(500);
    });

    expect(loadReadingState("chat-1")).toEqual({
      anchor: { messageId: "m-2", offset: 40 },
      openRows: ["m-2:1"],
    });
  });
});
