import { describe, it, expect } from "vitest";
import type { Chat } from "@/types";
import { applyHeldOrder } from "./freezeSortOrder";

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

function ids(chats: Chat[]): string[] {
  return chats.map((c) => c.id);
}

describe("applyHeldOrder", () => {
  it("keeps known chats in the held order, ignoring the fresh sort order", () => {
    const held = ["a", "b", "c"];
    // A background ingest re-sorted the fresh list, but membership is unchanged.
    const fresh = [chat("c"), chat("a"), chat("b")];

    expect(ids(applyHeldOrder(fresh, held))).toEqual(["a", "b", "c"]);
  });

  it("inserts a newly-appearing chat just before the held chat it precedes in the fresh sort", () => {
    const held = ["a", "b", "c"];
    // "x" is new and the fresh sort places it between b and c.
    const fresh = [chat("a"), chat("b"), chat("x"), chat("c")];

    expect(ids(applyHeldOrder(fresh, held))).toEqual(["a", "b", "x", "c"]);
  });

  it("appends a new chat that sorts after every held chat at the end", () => {
    const held = ["a", "b"];
    const fresh = [chat("a"), chat("b"), chat("z")];

    expect(ids(applyHeldOrder(fresh, held))).toEqual(["a", "b", "z"]);
  });

  it("drops held chats that are no longer present in the fresh list", () => {
    const held = ["a", "b", "c"];
    // "b" disappeared from the fresh list.
    const fresh = [chat("c"), chat("a")];

    expect(ids(applyHeldOrder(fresh, held))).toEqual(["a", "c"]);
  });
});
