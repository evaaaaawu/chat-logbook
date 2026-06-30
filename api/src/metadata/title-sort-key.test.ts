import { describe, it, expect } from "vitest";
import { computeSortKey } from "./title-sort-key.js";

// Sort the inputs by their computed key under BINARY (JS code-unit) compare —
// the same comparison SQLite applies to the indexed `sort_key` column — and
// return them in key order. This mirrors how the keyset query orders the axis.
function orderByKey(inputs: string[]): string[] {
  return [...inputs].sort((a, b) => {
    const ka = computeSortKey(a);
    const kb = computeSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

describe("computeSortKey — alphabetic ordering", () => {
  it("orders plain ASCII titles A-Z under BINARY compare", () => {
    expect(orderByKey(["banana", "apple", "cherry"])).toEqual([
      "apple",
      "banana",
      "cherry",
    ]);
  });

  it("orders embedded numbers numerically, not lexically (2 before 10)", () => {
    // Under a plain lexical compare "10" < "2"; the numeric encoding must flip
    // that so digit runs sort by value — matching today's numeric:true.
    expect(orderByKey(["Item 10", "Item 2", "Item 1"])).toEqual([
      "Item 1",
      "Item 2",
      "Item 10",
    ]);
    // Leading zeros are insignificant: "007" collates equal to "7".
    expect(computeSortKey("v007")).toBe(computeSortKey("v7"));
    // A longer number always sorts after a shorter one sharing a prefix.
    expect(orderByKey(["v9", "v100", "v25"])).toEqual(["v9", "v25", "v100"]);
  });

  it("is accent-insensitive: diacritics never change the key", () => {
    // NFKD decomposes the accent into a combining mark, which is then stripped,
    // so "café" and "cafe" collate equal — matching today's sensitivity:"base".
    expect(computeSortKey("café")).toBe(computeSortKey("cafe"));
    expect(computeSortKey("naïve")).toBe(computeSortKey("naive"));
    // Accented and unaccented forms interleave by their base letters, not after
    // the whole ASCII run.
    expect(orderByKey(["zoé", "ana", "andré"])).toEqual([
      "ana",
      "andré",
      "zoé",
    ]);
  });

  it("orders CJK titles by Unicode code point (deliberate zh-Hant drift)", () => {
    // ADR-0019 accepts code-point order for CJK: UTF-8 byte order equals
    // code-point order, which is NOT zh-Hant stroke/pinyin order. 中(U+4E2D) <
    // 你(U+4F60) < 我(U+6211) by code point.
    expect(orderByKey(["我", "你", "中"])).toEqual(["中", "你", "我"]);
  });

  it("is case-insensitive: case never changes the relative order", () => {
    // "Apple" and "apple" collate equal; "Banana" still sorts after both,
    // regardless of case — matching today's sensitivity:"base".
    expect(computeSortKey("Apple")).toBe(computeSortKey("apple"));
    // A stable sort keeps original order within each equal-key group: the two
    // apples lead (Apple before apple), then the two bananas (banana before
    // BANANA).
    expect(orderByKey(["banana", "Apple", "BANANA", "apple"])).toEqual([
      "Apple",
      "apple",
      "banana",
      "BANANA",
    ]);
  });
});
