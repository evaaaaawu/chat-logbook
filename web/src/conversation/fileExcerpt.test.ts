import { describe, it, expect } from "vitest";
import { buildExcerpt } from "./fileExcerpt";

describe("buildExcerpt", () => {
  it("splits a Read result's line numbers off its content", () => {
    const excerpt = buildExcerpt("1\tconst a = 1;\n2\tconst b = 2;", 100);

    expect(excerpt.lines).toEqual([
      { lineNumber: 1, text: "const a = 1;" },
      { lineNumber: 2, text: "const b = 2;" },
    ]);
    expect(excerpt.hiddenLines).toBe(0);
  });

  it("keeps a file's real numbers, which need not start at one", () => {
    const excerpt = buildExcerpt("40\tfourty\n41\tfourty-one", 100);

    expect(excerpt.lines.map((l) => l.lineNumber)).toEqual([40, 41]);
  });

  it("renders content with no number prefix as plain, unnumbered lines", () => {
    const excerpt = buildExcerpt("just some output\nno numbers here", 100);

    expect(excerpt.lines).toEqual([
      { lineNumber: null, text: "just some output" },
      { lineNumber: null, text: "no numbers here" },
    ]);
  });

  it("caps a long excerpt and reports what it withheld", () => {
    const content = ["1\ta", "2\tb", "3\tc", "4\td", "5\te"].join("\n");

    const excerpt = buildExcerpt(content, 3);

    expect(excerpt.lines.map((l) => l.text)).toEqual(["a", "b", "c"]);
    expect(excerpt.hiddenLines).toBe(2);
  });
});
