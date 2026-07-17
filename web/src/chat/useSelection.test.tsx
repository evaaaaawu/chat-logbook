import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useSelection } from "@/chat/useSelection";

const ORDER = ["a", "b", "c", "d", "e"];

describe("useSelection", () => {
  it("collapses to a single id on selectOnly", () => {
    const { result } = renderHook(() =>
      useSelection({ orderedIds: ORDER, primaryId: null, resetKey: "k" })
    );

    act(() => result.current.selectOnly("b"));
    expect([...result.current.selectedIds]).toEqual(["b"]);

    act(() => result.current.selectOnly("d"));
    expect([...result.current.selectedIds]).toEqual(["d"]);
  });

  it("adds an id on first toggle and removes it on the second", () => {
    const { result } = renderHook(() =>
      useSelection({ orderedIds: ORDER, primaryId: null, resetKey: "k" })
    );

    act(() => result.current.toggle("b"));
    expect([...result.current.selectedIds]).toEqual(["b"]);

    act(() => result.current.toggle("b"));
    expect([...result.current.selectedIds]).toEqual([]);
  });

  it("selectRange replaces with the inclusive span from anchor to target", () => {
    const { result } = renderHook(() =>
      useSelection({ orderedIds: ORDER, primaryId: null, resetKey: "k" })
    );

    act(() => result.current.toggle("e")); // an unrelated prior member
    act(() => result.current.selectRange("b", "d", false));

    // Replace mode: only the span survives.
    expect([...result.current.selectedIds].sort()).toEqual(["b", "c", "d"]);
  });

  it("selectRange additive unions the span with the current Selection", () => {
    const { result } = renderHook(() =>
      useSelection({ orderedIds: ORDER, primaryId: null, resetKey: "k" })
    );

    act(() => result.current.toggle("e"));
    act(() => result.current.selectRange("b", "d", true));

    expect([...result.current.selectedIds].sort()).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("ranges backwards too, from a later anchor to an earlier target", () => {
    const { result } = renderHook(() =>
      useSelection({ orderedIds: ORDER, primaryId: null, resetKey: "k" })
    );

    act(() => result.current.selectRange("d", "b", false));
    expect([...result.current.selectedIds].sort()).toEqual(["b", "c", "d"]);
  });

  it("collapses to the target when there is no anchor", () => {
    const { result } = renderHook(() =>
      useSelection({ orderedIds: ORDER, primaryId: null, resetKey: "k" })
    );

    act(() => result.current.selectRange(null, "c", false));
    expect([...result.current.selectedIds]).toEqual(["c"]);
  });

  it("keeps the Selection across a sort change or refresh (same resetKey)", () => {
    const { result, rerender } = renderHook(
      ({ orderedIds }) =>
        useSelection({ orderedIds, primaryId: "b", resetKey: "k" }),
      { initialProps: { orderedIds: ORDER } }
    );

    act(() => result.current.toggle("d"));
    // A re-sort/refresh reorders the ids but the key holds steady.
    rerender({ orderedIds: ["e", "d", "c", "b", "a"] });

    expect([...result.current.selectedIds].sort()).toEqual(["b", "d"]);
  });

  it("re-seeds to the primary when the resetKey changes (filter change / view switch)", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useSelection({ orderedIds: ORDER, primaryId: "a", resetKey }),
      { initialProps: { resetKey: "k1" } }
    );

    act(() => result.current.toggle("c"));
    expect([...result.current.selectedIds].sort()).toEqual(["a", "c"]);

    rerender({ resetKey: "k2" });
    // Collapses back to just the primary, not to empty.
    expect([...result.current.selectedIds]).toEqual(["a"]);
  });

  it("clears to empty via clear()", () => {
    const { result } = renderHook(() =>
      useSelection({ orderedIds: ORDER, primaryId: null, resetKey: "k" })
    );

    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("c"));
    act(() => result.current.clear());

    expect([...result.current.selectedIds]).toEqual([]);
  });
});

describe("useSelection — select-all-matching (#164)", () => {
  it("enters select-all-matching, counting the whole filtered total", () => {
    const { result } = renderHook(() =>
      useSelection({
        orderedIds: ORDER,
        primaryId: null,
        resetKey: "k",
        filteredTotal: 1234,
      })
    );

    expect(result.current.allMatching).toBe(false);

    act(() => result.current.selectAllMatching());

    expect(result.current.allMatching).toBe(true);
    // The count is the whole matching set, not just the loaded window.
    expect(result.current.selectedCount).toBe(1234);
    // Every visible row reads as selected.
    expect(result.current.isSelected("a")).toBe(true);
    expect([...result.current.excludeIds]).toEqual([]);
  });

  it("toggling under select-all records and clears exclusions", () => {
    const { result } = renderHook(() =>
      useSelection({
        orderedIds: ORDER,
        primaryId: null,
        resetKey: "k",
        filteredTotal: 10,
      })
    );

    act(() => result.current.selectAllMatching());

    // A toggle deselects one matching row: it lands in excludeIds.
    act(() => result.current.toggle("b"));
    expect([...result.current.excludeIds]).toEqual(["b"]);
    expect(result.current.isSelected("b")).toBe(false);
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.selectedCount).toBe(9);

    // A second toggle re-selects it: the exclusion clears.
    act(() => result.current.toggle("b"));
    expect([...result.current.excludeIds]).toEqual([]);
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.selectedCount).toBe(10);
  });

  it("leaves select-all-matching on clear()", () => {
    const { result } = renderHook(() =>
      useSelection({
        orderedIds: ORDER,
        primaryId: null,
        resetKey: "k",
        filteredTotal: 10,
      })
    );

    act(() => result.current.selectAllMatching());
    act(() => result.current.toggle("b"));
    act(() => result.current.clear());

    expect(result.current.allMatching).toBe(false);
    expect([...result.current.excludeIds]).toEqual([]);
    expect(result.current.selectedCount).toBe(0);
  });

  it("leaves select-all-matching when the filter/view resetKey changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useSelection({
          orderedIds: ORDER,
          primaryId: null,
          resetKey,
          filteredTotal: 10,
        }),
      { initialProps: { resetKey: "k1" } }
    );

    act(() => result.current.selectAllMatching());
    act(() => result.current.toggle("b"));

    rerender({ resetKey: "k2" });

    expect(result.current.allMatching).toBe(false);
    expect([...result.current.excludeIds]).toEqual([]);
  });
});
