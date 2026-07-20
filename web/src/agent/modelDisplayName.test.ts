import { describe, expect, it } from "vitest";
import { getModelDisplayName } from "./modelDisplayName";

describe("getModelDisplayName", () => {
  it("names a known model id the way the model is written", () => {
    expect(getModelDisplayName("claude-opus-4-8")).toBe("Opus 4.8");
  });

  it("names an unmapped model that still follows the id convention", () => {
    expect(getModelDisplayName("claude-something-9")).toBe("Something 9");
  });

  it("shows an id of no known shape as-is, rather than guessing at a name", () => {
    // The honest floor: an id we cannot read stays readable as itself. Covers a
    // different vendor and Anthropic's own older ordering, where the version
    // came before the family.
    expect(getModelDisplayName("gpt-4o")).toBe("gpt-4o");
    expect(getModelDisplayName("claude-3-5-sonnet-20241022")).toBe(
      "claude-3-5-sonnet-20241022"
    );
  });

  it("derives a name for an unmapped snapshot of a familiar id shape", () => {
    // A new dated snapshot of a model we already show should not regress to a
    // raw id just because the date moved — the date is not part of the name.
    expect(getModelDisplayName("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(getModelDisplayName("claude-haiku-4-5-20260315")).toBe("Haiku 4.5");
  });
});
