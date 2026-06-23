import { describe, it, expect } from "vitest";
import { UNTAGGED } from "./filterChatsByTags";
import { toggleTagSelection } from "./toggleTagSelection";

describe("toggleTagSelection", () => {
  it("adds a real tag to an empty selection", () => {
    expect([...toggleTagSelection(new Set(), "t-bug")]).toEqual(["t-bug"]);
  });

  it("removes a real tag that was already selected", () => {
    expect([...toggleTagSelection(new Set(["t-bug"]), "t-bug")]).toEqual([]);
  });

  it("accumulates several real tags (AND within)", () => {
    expect(
      [...toggleTagSelection(new Set(["t-bug"]), "t-idea")].sort()
    ).toEqual(["t-bug", "t-idea"]);
  });

  it("clears every real tag when Untagged is selected", () => {
    expect([
      ...toggleTagSelection(new Set(["t-bug", "t-idea"]), UNTAGGED),
    ]).toEqual([UNTAGGED]);
  });

  it("clears Untagged when a real tag is selected", () => {
    expect([...toggleTagSelection(new Set([UNTAGGED]), "t-bug")]).toEqual([
      "t-bug",
    ]);
  });

  it("deselecting Untagged returns to the unfiltered state", () => {
    expect([...toggleTagSelection(new Set([UNTAGGED]), UNTAGGED)]).toEqual([]);
  });

  it("never mutates the input set", () => {
    const input = new Set(["t-bug"]);
    toggleTagSelection(input, UNTAGGED);
    expect([...input]).toEqual(["t-bug"]);
  });
});
