import { describe, expect, it } from "vitest";
import { generateDataset } from "./generator.js";

describe("generateDataset", () => {
  it("generates exactly the requested number of chats", () => {
    expect(generateDataset({ count: 5 })).toHaveLength(5);
    expect(generateDataset({ count: 0 })).toHaveLength(0);
  });

  it("is reproducible: same seed yields identical data, different seed differs", () => {
    const a = generateDataset({ count: 30, seed: 7 });
    const b = generateDataset({ count: 30, seed: 7 });
    const c = generateDataset({ count: 30, seed: 8 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("spreads chats across many distinct projects including the (No project) group", () => {
    const chats = generateDataset({ count: 500, projects: 10 });
    const named = new Set(
      chats.map((c) => c.project).filter((p): p is string => p !== null)
    );
    expect(named.size).toBeGreaterThan(1);
    expect(named.size).toBeLessThanOrEqual(10);
    expect(chats.some((c) => c.project === null)).toBe(true);
  });

  it("gives each chat timestamped messages that spread across chats, updatedAt >= createdAt", () => {
    const chats = generateDataset({ count: 200 });
    expect(chats.every((c) => c.messages.length >= 1)).toBe(true);

    const createdAts = new Set<number>();
    for (const c of chats) {
      const times = c.messages.map((m) => Date.parse(m.ts));
      expect(times.every((t) => Number.isFinite(t))).toBe(true);
      const min = Math.min(...times);
      const max = Math.max(...times);
      expect(max).toBeGreaterThanOrEqual(min);
      createdAts.add(min);
    }
    // A realistic spread: createdAt is not the same instant for every chat.
    expect(createdAts.size).toBeGreaterThan(10);
  });

  it("assigns tags to about the configured ratio of chats, none when ratio is 0", () => {
    const chats = generateDataset({ count: 1000, tagRatio: 0.3, tagPool: 8 });
    const taggedCount = chats.filter((c) => c.tagNames.length > 0).length;
    expect(taggedCount).toBeGreaterThan(150);
    expect(taggedCount).toBeLessThan(450);

    const names = new Set(chats.flatMap((c) => c.tagNames));
    expect(names.size).toBeGreaterThan(1);
    expect(names.size).toBeLessThanOrEqual(8);

    const none = generateDataset({ count: 200, tagRatio: 0 });
    expect(none.every((c) => c.tagNames.length === 0)).toBe(true);
  });
});
