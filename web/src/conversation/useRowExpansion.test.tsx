import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRowExpansion } from "./useRowExpansion";

describe("useRowExpansion", () => {
  it("opens the rows it is seeded with", () => {
    const { result } = renderHook(() =>
      useRowExpansion("chat-1", { initialOpenRows: ["m-1:0"] })
    );

    expect(result.current.isKeyExpanded("m-1:0")).toBe(true);
    expect(result.current.isKeyExpanded("m-2:0")).toBe(false);
  });

  it("re-seeds from the new chat's rows when the chat changes", () => {
    const { result, rerender } = renderHook(
      ({ chatId, seed }) => useRowExpansion(chatId, { initialOpenRows: seed }),
      { initialProps: { chatId: "chat-1", seed: ["m-1:0"] } }
    );

    expect(result.current.isKeyExpanded("m-1:0")).toBe(true);

    rerender({ chatId: "chat-2", seed: ["m-9:0"] });

    expect(result.current.isKeyExpanded("m-1:0")).toBe(false);
    expect(result.current.isKeyExpanded("m-9:0")).toBe(true);
  });

  it("reports the open rows after a toggle", () => {
    const onOpenRowsChange = vi.fn();
    const { result } = renderHook(() =>
      useRowExpansion("chat-1", { onOpenRowsChange })
    );

    act(() => result.current.toggleKey("m-1:0"));

    expect(onOpenRowsChange).toHaveBeenLastCalledWith(["m-1:0"]);
  });
});
