import { describe, it, expect } from "vitest";
import type { Chat } from "@/types";
import { sortChats } from "./sortChats";

function makeChat(overrides: Partial<Chat>): Chat {
  return {
    id: "id",
    sourceId: "session-1",
    agent: "claude-code",
    title: "",
    project: "p",
    projectPath: null,
    sourceFilePath: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("sortChats — title", () => {
  it("orders titles A-Z with locale-aware comparison when direction is asc", () => {
    const chats = [
      makeChat({ id: "b", title: "Banana" }),
      makeChat({ id: "a", title: "apple" }),
      makeChat({ id: "c", title: "Cherry" }),
    ];

    const sorted = sortChats(chats, "title", "asc");

    expect(sorted.map((c) => c.title)).toEqual(["apple", "Banana", "Cherry"]);
  });

  it("orders embedded numbers naturally (item2 before item10)", () => {
    const chats = [
      makeChat({ id: "10", title: "item10" }),
      makeChat({ id: "2", title: "item2" }),
      makeChat({ id: "1", title: "item1" }),
    ];

    const sorted = sortChats(chats, "title", "asc");

    expect(sorted.map((c) => c.title)).toEqual(["item1", "item2", "item10"]);
  });

  it("sinks empty and null titles to the bottom in both directions", () => {
    const chats = [
      makeChat({ id: "empty", title: "" }),
      makeChat({ id: "b", title: "Banana" }),
      makeChat({ id: "null", title: null as unknown as string }),
      makeChat({ id: "a", title: "Apple" }),
    ];

    const asc = sortChats(chats, "title", "asc");
    expect(asc.map((c) => c.id).slice(0, 2)).toEqual(["a", "b"]);
    expect(asc.map((c) => c.id).slice(2)).toEqual(
      expect.arrayContaining(["empty", "null"])
    );

    const desc = sortChats(chats, "title", "desc");
    expect(desc.map((c) => c.id).slice(0, 2)).toEqual(["b", "a"]);
    expect(desc.map((c) => c.id).slice(2)).toEqual(
      expect.arrayContaining(["empty", "null"])
    );
  });
});

describe("sortChats — time axes", () => {
  it("orders by updatedAt newest-first when direction is desc", () => {
    const chats = [
      makeChat({ id: "old", updatedAt: 100 }),
      makeChat({ id: "new", updatedAt: 300 }),
      makeChat({ id: "mid", updatedAt: 200 }),
    ];

    const sorted = sortChats(chats, "updatedAt", "desc");

    expect(sorted.map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });

  it("orders by createdAt oldest-first when direction is asc", () => {
    const chats = [
      makeChat({ id: "old", createdAt: 100 }),
      makeChat({ id: "new", createdAt: 300 }),
      makeChat({ id: "mid", createdAt: 200 }),
    ];

    const sorted = sortChats(chats, "createdAt", "asc");

    expect(sorted.map((c) => c.id)).toEqual(["old", "mid", "new"]);
  });

  it("orders by deletedAt newest-first when direction is desc", () => {
    const chats = [
      makeChat({ id: "old", deletedAt: 100 }),
      makeChat({ id: "new", deletedAt: 300 }),
      makeChat({ id: "mid", deletedAt: 200 }),
    ];

    const sorted = sortChats(chats, "deletedAt", "desc");

    expect(sorted.map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });

  it("treats a null deletedAt as the oldest when sorting by deletedAt", () => {
    const chats = [
      makeChat({ id: "set", deletedAt: 200 }),
      makeChat({ id: "null", deletedAt: null }),
    ];

    const desc = sortChats(chats, "deletedAt", "desc");
    expect(desc.map((c) => c.id)).toEqual(["set", "null"]);
  });
});

describe("sortChats — tie-breakers", () => {
  it("breaks equal primary keys by updatedAt desc, then createdAt desc, then id asc", () => {
    const chats = [
      makeChat({ id: "z", title: "Same", updatedAt: 100, createdAt: 50 }),
      makeChat({ id: "a", title: "Same", updatedAt: 100, createdAt: 50 }),
      makeChat({
        id: "newer-created",
        title: "Same",
        updatedAt: 100,
        createdAt: 90,
      }),
      makeChat({
        id: "newest-updated",
        title: "Same",
        updatedAt: 300,
        createdAt: 10,
      }),
    ];

    const sorted = sortChats(chats, "title", "asc");

    expect(sorted.map((c) => c.id)).toEqual([
      "newest-updated", // updatedAt desc wins first
      "newer-created", // among equal updatedAt, createdAt desc
      "a", // among equal updatedAt+createdAt, id asc
      "z",
    ]);
  });
});
