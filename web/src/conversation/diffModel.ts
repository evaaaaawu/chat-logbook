import type { PatchHunk } from "@/types";

export type DiffLineKind = "add" | "remove" | "context";

/**
 * One rendered diff line, carrying both sides' real line numbers.
 *
 * A line absent from one side numbers `null` there: an added line has no old
 * number, a removed line no new one. Both numbers are kept — not just the side
 * a unified view shows — so a later side-by-side layout can pair lines by them
 * without re-deriving the diff (#237).
 */
export interface DiffLine {
  kind: DiffLineKind;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  /** The line's content, with its `+`, `-` or space prefix stripped. */
  text: string;
}

export interface DiffHunk {
  lines: DiffLine[];
}

export interface DiffModel {
  hunks: DiffHunk[];
  /** Content lines dropped past the cap; 0 when the whole diff renders. */
  hiddenLines: number;
}

/**
 * Turn unified-diff hunks into rows with real, per-side line numbers.
 *
 * Numbers restart from each hunk's own `oldStart`/`newStart` rather than
 * running from one, so a multi-hunk patch keeps every line at its true position
 * in the file. `lineCap` bounds the total content lines rendered; the overflow
 * is reported as `hiddenLines` so the view can offer to reveal the rest.
 */
export function buildDiff(patch: PatchHunk[], lineCap: number): DiffModel {
  const hunks: DiffHunk[] = [];
  let rendered = 0;
  let hiddenLines = 0;

  for (const hunk of patch) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    const lines: DiffLine[] = [];

    for (const raw of hunk.lines) {
      const marker = raw[0];
      const text = raw.slice(1);

      if (rendered >= lineCap) {
        hiddenLines += 1;
        continue;
      }

      if (marker === "+") {
        lines.push({
          kind: "add",
          oldLineNumber: null,
          newLineNumber: newLine,
          text,
        });
        newLine += 1;
      } else if (marker === "-") {
        lines.push({
          kind: "remove",
          oldLineNumber: oldLine,
          newLineNumber: null,
          text,
        });
        oldLine += 1;
      } else {
        lines.push({
          kind: "context",
          oldLineNumber: oldLine,
          newLineNumber: newLine,
          text,
        });
        oldLine += 1;
        newLine += 1;
      }
      rendered += 1;
    }

    if (lines.length > 0) hunks.push({ lines });
  }

  return { hunks, hiddenLines };
}
