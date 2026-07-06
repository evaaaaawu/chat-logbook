import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { Chat } from "@/types";
import { useCursorNavigation } from "@/chat/useCursorNavigation";

function chat(id: string): Chat {
  return {
    id,
    sourceId: id.toUpperCase(),
    agent: "claude-code",
    title: id,
    project: "p",
    projectPath: null,
    sourceFilePath: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const chats = [chat("a"), chat("b"), chat("c")];

function pressArrow(key: "ArrowDown" | "ArrowUp") {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useCursorNavigation", () => {
  it("moves the Cursor to the row after the Open Chat on ArrowDown", () => {
    const { result } = renderHook(() =>
      useCursorNavigation({ chats, openId: "a", onOpen: vi.fn() })
    );

    expect(result.current.cursorId).toBeNull();

    pressArrow("ArrowDown");

    expect(result.current.cursorId).toBe("b");
    expect(result.current.cursorIndex).toBe(1);
  });

  it("moves the Cursor up one row on ArrowUp", () => {
    const { result } = renderHook(() =>
      useCursorNavigation({ chats, openId: "b", onOpen: vi.fn() })
    );

    pressArrow("ArrowDown"); // from Open Chat "b" (index 1) -> "c" (index 2)
    expect(result.current.cursorId).toBe("c");

    pressArrow("ArrowUp");
    expect(result.current.cursorId).toBe("b");
    expect(result.current.cursorIndex).toBe(1);
  });

  it("clamps the Cursor at the last row on ArrowDown", () => {
    const { result } = renderHook(() =>
      useCursorNavigation({ chats, openId: "c", onOpen: vi.fn() })
    );

    pressArrow("ArrowDown"); // already the Open Chat at the last row
    pressArrow("ArrowDown");

    expect(result.current.cursorId).toBe("c");
    expect(result.current.cursorIndex).toBe(2);
  });

  it("clamps the Cursor at the first row on ArrowUp", () => {
    const { result } = renderHook(() =>
      useCursorNavigation({ chats, openId: "a", onOpen: vi.fn() })
    );

    pressArrow("ArrowUp"); // first move from Open Chat "a" at the head
    pressArrow("ArrowUp");

    expect(result.current.cursorId).toBe("a");
    expect(result.current.cursorIndex).toBe(0);
  });

  it("opens the landed Chat once, debounced, after rapid arrow presses", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    renderHook(() =>
      useCursorNavigation({ chats, openId: "a", onOpen, debounceMs: 150 })
    );

    pressArrow("ArrowDown"); // -> "b"
    pressArrow("ArrowDown"); // -> "c"

    // Nothing opens mid-flight, before the debounce elapses.
    act(() => vi.advanceTimersByTime(149));
    expect(onOpen).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("c");
  });

  it("re-anchors the Cursor to the Open Chat when it changes by mouse click", () => {
    const { result, rerender } = renderHook(
      ({ openId }) => useCursorNavigation({ chats, openId, onOpen: vi.fn() }),
      { initialProps: { openId: "a" as string } }
    );

    // A mouse click on row "c" flows through the parent as a new Open Chat.
    rerender({ openId: "c" });
    expect(result.current.cursorId).toBe("c");

    // Keyboard now continues from the clicked row, not a stale position.
    pressArrow("ArrowUp");
    expect(result.current.cursorId).toBe("b");
  });

  it("does not re-open the Chat when the Cursor syncs to an external open change", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const { rerender } = renderHook(
      ({ openId }) =>
        useCursorNavigation({ chats, openId, onOpen, debounceMs: 150 }),
      { initialProps: { openId: "a" as string } }
    );

    rerender({ openId: "c" }); // mouse click, not a keyboard move
    act(() => vi.advanceTimersByTime(200));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores arrows while an editable element (a title input) holds focus", () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useCursorNavigation({ chats, openId: "a", onOpen })
    );

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });

    expect(result.current.cursorId).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();

    input.remove();
  });

  it("ignores arrows while focus sits inside an open popover", () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useCursorNavigation({ chats, openId: "a", onOpen })
    );

    const popover = document.createElement("div");
    popover.setAttribute("data-slot", "popover-content");
    const swatch = document.createElement("button"); // a non-editable target
    popover.appendChild(swatch);
    document.body.appendChild(popover);

    act(() => {
      swatch.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });

    expect(result.current.cursorId).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();

    popover.remove();
  });
});
