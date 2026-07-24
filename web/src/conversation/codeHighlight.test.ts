import { describe, it, expect } from "vitest";
import { languageForPath } from "./codeHighlight";

describe("languageForPath", () => {
  it("infers the highlight language from a file's extension", () => {
    expect(languageForPath("web/src/conversation/DiffView.tsx")).toBe(
      "typescript"
    );
  });

  it("returns null for an unrecognised extension, so the diff renders plain", () => {
    expect(languageForPath("notes/journal.xyz")).toBeNull();
  });
});
