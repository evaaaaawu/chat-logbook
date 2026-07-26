import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  languageForPath,
  loadHighlighter,
  useLanguageHighlighter,
} from "./codeHighlight";

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

describe("useLanguageHighlighter", () => {
  it("renders plain for a language the bundle does not carry", async () => {
    // A markdown fence carries whatever word the writer typed after the
    // backticks. `mermaid` is a real one, and not a language the common bundle
    // registers — asking the highlighter for it must leave the block plain,
    // the same as an unrecognised file extension, rather than throw.
    const { result } = renderHook(() => useLanguageHighlighter("mermaid"));

    await act(async () => {
      await loadHighlighter();
    });

    expect(result.current).toBeNull();
  });
});
