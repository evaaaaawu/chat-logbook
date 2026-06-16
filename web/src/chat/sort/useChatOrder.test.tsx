import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { Chat } from "@/types";
import { useChatOrder } from "@/chat/sort/useChatOrder";

function chat(id: string, fields: Partial<Chat> = {}): Chat {
  return {
    id,
    chatId: id.toUpperCase(),
    agent: "claude-code",
    title: id,
    project: "p",
    projectPath: null,
    sourceFilePath: null,
    createdAt: 0,
    updatedAt: 0,
    ...fields,
  };
}

function ids(chats: Chat[]): string[] {
  return chats.map((c) => c.id);
}

// Active (non-deleted) chats in no particular order; updatedAt drives the
// default Chats-list sort (Updated time, newest first).
function activeChats(): Chat[] {
  return [
    chat("a", { updatedAt: 100 }),
    chat("b", { updatedAt: 300 }),
    chat("c", { updatedAt: 200 }),
  ];
}

// Deleted chats; deletedAt drives the default Trash sort (newest deleted first).
function deletedChats(): Chat[] {
  return [
    chat("x", { isDeleted: true, deletedAt: 100, updatedAt: 50 }),
    chat("y", { isDeleted: true, deletedAt: 300, updatedAt: 70 }),
  ];
}

describe("useChatOrder", () => {
  it("orders the main view by the default preference and excludes deleted chats", () => {
    const chats = [...activeChats(), ...deletedChats()];
    const { result } = renderHook(() => useChatOrder("main", chats, "0:0"));

    // Default Chats sort: Updated time, newest first. Deleted chats excluded.
    expect(ids(result.current.orderedChats)).toEqual(["b", "c", "a"]);
    expect(result.current.sortControlProps.field).toBe("updatedAt");
    expect(result.current.sortControlProps.isDefault).toBe(true);
    expect(result.current.sortControlProps.testId).toBe("chat-sort-popover");
  });

  it("orders the trash view by deletedAt and includes only deleted chats", () => {
    const chats = [...activeChats(), ...deletedChats()];
    const { result } = renderHook(() => useChatOrder("trash", chats, "0:0"));

    // Default Trash sort: Deleted time, newest first. Active chats excluded.
    expect(ids(result.current.orderedChats)).toEqual(["y", "x"]);
    expect(result.current.sortControlProps.field).toBe("deletedAt");
    expect(result.current.sortControlProps.testId).toBe("trash-sort-popover");
    // Trash axes carry the Deleted time axis that the main view omits.
    expect(result.current.sortControlProps.axes.map((a) => a.field)).toContain(
      "deletedAt"
    );
  });

  it("freezes the row order across a background change under the same signal", () => {
    const { result, rerender } = renderHook(
      ({ chats, signal }) => useChatOrder("main", chats, signal),
      { initialProps: { chats: activeChats(), signal: "0:0" } }
    );

    // Anchored order: b (300), c (200), a (100).
    expect(ids(result.current.orderedChats)).toEqual(["b", "c", "a"]);

    // Background ingest bumps "a" to the newest updatedAt under the SAME signal.
    // A live re-sort would float "a" to the top; the frozen order must not.
    const bumped = [
      chat("a", { updatedAt: 999 }),
      chat("b", { updatedAt: 300 }),
      chat("c", { updatedAt: 200 }),
    ];
    rerender({ chats: bumped, signal: "0:0" });

    expect(ids(result.current.orderedChats)).toEqual(["b", "c", "a"]);
  });

  it("slots a newly-appearing chat into its sorted position while holding the rest", () => {
    const { result, rerender } = renderHook(
      ({ chats, signal }) => useChatOrder("main", chats, signal),
      { initialProps: { chats: activeChats(), signal: "0:0" } }
    );
    expect(ids(result.current.orderedChats)).toEqual(["b", "c", "a"]);

    // A background ingest adds "d" (updatedAt 250), which sorts between b (300)
    // and c (200). No existing chat moves; only the new chat appears.
    const withNew = [...activeChats(), chat("d", { updatedAt: 250 })];
    rerender({ chats: withNew, signal: "0:0" });

    expect(ids(result.current.orderedChats)).toEqual(["b", "d", "c", "a"]);
  });

  it("re-sorts when the user changes the sort field via sortControlProps", () => {
    const { result } = renderHook(() =>
      useChatOrder("main", activeChats(), "0:0")
    );

    // Default Updated-time order.
    expect(ids(result.current.orderedChats)).toEqual(["b", "c", "a"]);

    // Selecting Title (A-Z) is a user action: the order re-sorts immediately.
    // Titles default to the id, so A-Z is a, b, c.
    act(() => {
      result.current.sortControlProps.onSelectField("title");
    });

    expect(result.current.sortControlProps.field).toBe("title");
    expect(ids(result.current.orderedChats)).toEqual(["a", "b", "c"]);
  });

  it("re-sorts with the latest data when the flush signal changes", () => {
    const { result, rerender } = renderHook(
      ({ chats, signal }) => useChatOrder("main", chats, signal),
      { initialProps: { chats: activeChats(), signal: "0:0" } }
    );

    // Background bump "a" to newest under the same signal: order stays frozen.
    const bumped = [
      chat("a", { updatedAt: 999 }),
      chat("b", { updatedAt: 300 }),
      chat("c", { updatedAt: 200 }),
    ];
    rerender({ chats: bumped, signal: "0:0" });
    expect(ids(result.current.orderedChats)).toEqual(["b", "c", "a"]);

    // A new flush signal (e.g. a data action or view switch) re-sorts with the
    // latest data: "a" floats to the top.
    rerender({ chats: bumped, signal: "1:0" });
    expect(ids(result.current.orderedChats)).toEqual(["a", "b", "c"]);
  });
});
