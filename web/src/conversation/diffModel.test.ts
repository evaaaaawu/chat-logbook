import { describe, it, expect } from "vitest";
import type { PatchHunk } from "@/types";
import { buildDiff } from "./diffModel";

const NO_CAP = Number.POSITIVE_INFINITY;

describe("buildDiff", () => {
  it("numbers a single hunk from its own starts, tagging each line's kind", () => {
    const { hunks, hiddenLines } = buildDiff(
      [
        {
          oldStart: 40,
          oldLines: 3,
          newStart: 40,
          newLines: 3,
          lines: ["   return (", "-  <pre>", "+  <DiffView />", "   );"],
        },
      ],
      NO_CAP
    );

    expect(hiddenLines).toBe(0);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toEqual([
      {
        kind: "context",
        oldLineNumber: 40,
        newLineNumber: 40,
        text: "  return (",
      },
      {
        kind: "remove",
        oldLineNumber: 41,
        newLineNumber: null,
        text: "  <pre>",
      },
      {
        kind: "add",
        oldLineNumber: null,
        newLineNumber: 41,
        text: "  <DiffView />",
      },
      { kind: "context", oldLineNumber: 42, newLineNumber: 42, text: "  );" },
    ]);
  });

  it("restarts numbering at each hunk's own starts, not running from the first", () => {
    const { hunks } = buildDiff(
      [
        {
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 2,
          lines: ["-a", "+b"],
        },
        {
          oldStart: 40,
          oldLines: 2,
          newStart: 41,
          newLines: 3,
          lines: [" keep", "-c", "+d", "+e"],
        },
      ],
      NO_CAP
    );

    expect(hunks).toHaveLength(2);
    // Second hunk numbers from 40/41, not from where the first hunk left off.
    expect(hunks[1].lines).toEqual([
      { kind: "context", oldLineNumber: 40, newLineNumber: 41, text: "keep" },
      { kind: "remove", oldLineNumber: 41, newLineNumber: null, text: "c" },
      { kind: "add", oldLineNumber: null, newLineNumber: 42, text: "d" },
      { kind: "add", oldLineNumber: null, newLineNumber: 43, text: "e" },
    ]);
  });

  const fiveLineHunk: PatchHunk = {
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 4,
    lines: [" a", "-b", "+c", "+d", " e"],
  };

  it("renders the whole diff when the cap equals the line count", () => {
    const { hunks, hiddenLines } = buildDiff([fiveLineHunk], 5);

    expect(hiddenLines).toBe(0);
    expect(hunks[0].lines).toHaveLength(5);
  });

  it("stops at the cap and reports the remainder as hidden", () => {
    const { hunks, hiddenLines } = buildDiff([fiveLineHunk], 3);

    expect(hunks[0].lines).toHaveLength(3);
    expect(hiddenLines).toBe(2);
    // The kept lines still carry their true numbers up to the cut.
    expect(hunks[0].lines.map((l) => l.kind)).toEqual([
      "context",
      "remove",
      "add",
    ]);
  });

  it("counts the cap across hunks, dropping a whole later hunk past it", () => {
    const { hunks, hiddenLines } = buildDiff(
      [
        fiveLineHunk,
        {
          oldStart: 9,
          oldLines: 1,
          newStart: 10,
          newLines: 2,
          lines: [" f", "+g"],
        },
      ],
      5
    );

    expect(hunks).toHaveLength(1);
    expect(hiddenLines).toBe(2);
  });
});
