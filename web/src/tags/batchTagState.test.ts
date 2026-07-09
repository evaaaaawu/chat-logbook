import { describe, it, expect } from "vitest";
import type { Tag } from "@/types";
import { deriveBatchTagStates } from "@/tags/batchTagState";

const bug: Tag = { id: "t-bug", name: "bug", color: "red" };
const idea: Tag = { id: "t-idea", name: "idea", color: "violet" };

describe("deriveBatchTagStates", () => {
  it("marks a tag on every selected chat as 'all', on some as 'some', on none as absent", () => {
    // Two chats selected: bug is on both, idea on one, and a third tag on none.
    const states = deriveBatchTagStates(2, {
      "chat-1": [bug, idea],
      "chat-2": [bug],
    });

    expect(states.get(bug.id)).toBe("all");
    expect(states.get(idea.id)).toBe("some");
    expect(states.get("t-unused")).toBeUndefined();
  });
});
