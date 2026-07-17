import { describe, it, expect } from "vitest";
import { selectAllTagStates } from "@/tags/selectAllTagState";

describe("selectAllTagStates — tri-state under select-all-matching (#164)", () => {
  it("marks a tag 'all' when every selected chat holds it", () => {
    const states = selectAllTagStates({
      selectedCount: 8,
      tagCounts: new Map([["bug", 8]]),
      excludedTags: [],
    });
    expect(states.get("bug")).toBe("all");
  });

  it("marks a tag 'some' when only part of the selection holds it", () => {
    const states = selectAllTagStates({
      selectedCount: 8,
      tagCounts: new Map([["bug", 3]]),
      excludedTags: [],
    });
    expect(states.get("bug")).toBe("some");
  });

  it("marks a tag 'none' when no selected chat holds it", () => {
    const states = selectAllTagStates({
      selectedCount: 8,
      tagCounts: new Map([["bug", 0]]),
      excludedTags: [],
    });
    expect(states.get("bug")).toBe("none");
  });

  it("subtracts the excluded chats' tags from the facet count", () => {
    // 8 matching chats hold bug; the 2 excluded chats both held bug, so only 6
    // of the 6 remaining selected chats hold it → still 'all'.
    const states = selectAllTagStates({
      selectedCount: 6, // filteredTotal 8 minus 2 excluded
      tagCounts: new Map([["bug", 8]]),
      excludedTags: [["bug"], ["bug"]],
    });
    expect(states.get("bug")).toBe("all");
  });

  it("drops to 'some' when excluding chats leaves a partial hold", () => {
    // 8 hold bug; exclude 1 that held bug → 7 of 7 selected hold it → 'all'...
    // but here 8 hold bug out of total, exclude 1 non-bug chat: 8 of 7? clamp.
    const states = selectAllTagStates({
      selectedCount: 7,
      tagCounts: new Map([["bug", 5]]),
      excludedTags: [["idea"]], // the excluded chat did not hold bug
    });
    // 5 of 7 selected hold bug → 'some'.
    expect(states.get("bug")).toBe("some");
  });

  it("reports 'none' for every tag when the selection is empty", () => {
    const states = selectAllTagStates({
      selectedCount: 0,
      tagCounts: new Map([["bug", 4]]),
      excludedTags: [],
    });
    expect(states.get("bug")).toBe("none");
  });
});
