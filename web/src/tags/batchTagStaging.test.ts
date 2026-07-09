import { describe, it, expect } from "vitest";
import type { TagState } from "@/tags/TagPickerDialog";
import {
  batchTagDiff,
  displayStateFor,
  toggleStaged,
} from "@/tags/batchTagStaging";

const empty = new Map<string, TagState>();

describe("batchTagStaging", () => {
  it("toggles a 'none' or 'some' row toward add-all ('all')", () => {
    const initial = new Map<string, TagState>([["t-some", "some"]]);

    const afterNone = toggleStaged(empty, "none", "t-none");
    const afterSome = toggleStaged(empty, "some", "t-some");

    expect(displayStateFor(afterNone, empty, "t-none")).toBe("all");
    expect(displayStateFor(afterSome, initial, "t-some")).toBe("all");
  });

  it("toggles an 'all' row toward remove-all ('none')", () => {
    const initial = new Map<string, TagState>([["t-all", "all"]]);

    const staged = toggleStaged(empty, "all", "t-all");

    expect(displayStateFor(staged, initial, "t-all")).toBe("none");
  });

  it("computes a net add/remove diff, ignoring untouched tags", () => {
    // add-me starts none → staged all (add); drop-me starts all → staged none
    // (remove); some-untouched is never toggled and must not appear.
    const initial = new Map<string, TagState>([
      ["drop-me", "all"],
      ["some-untouched", "some"],
    ]);
    let staged = toggleStaged(empty, "none", "add-me");
    staged = toggleStaged(staged, "all", "drop-me");

    expect(batchTagDiff(staged, initial)).toEqual({
      add: ["add-me"],
      remove: ["drop-me"],
    });
  });

  it("drops a tag from the diff when toggled back to its initial state", () => {
    const initial = new Map<string, TagState>([["t-all", "all"]]);

    // all → none → all: back where it started, so no net change.
    let staged = toggleStaged(empty, "all", "t-all");
    staged = toggleStaged(staged, "all", "t-all");

    expect(displayStateFor(staged, initial, "t-all")).toBe("all");
    expect(batchTagDiff(staged, initial)).toEqual({ add: [], remove: [] });
  });
});
