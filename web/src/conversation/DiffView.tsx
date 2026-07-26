import { useState } from "react";
import type { PatchHunk } from "@/types";
import { buildDiff, type DiffLine } from "@/conversation/diffModel";
import { useHighlighter } from "@/conversation/codeHighlight";

interface DiffViewProps {
  filePath: string;
  patch: PatchHunk[];
  /**
   * Most content lines rendered before the rest is folded behind a reveal
   * control. A long edit is capped so it cannot stall the pane; the reader
   * opts into the tail (#237).
   */
  lineCap?: number;
  /**
   * How many rendered lines get syntax highlighting. Lines past this cap render
   * plain, so revealing a very long diff is never blocked on highlighting every
   * line — the red/green ground still carries them (#240).
   */
  highlightCap?: number;
}

const DEFAULT_LINE_CAP = 40;
const DEFAULT_HIGHLIGHT_CAP = 500;

// Both sides tinted, so a row reads as added or removed from its ground alone —
// the line-number gutters then say where it sits. Context stays untinted and
// muted: the quiet backdrop the changed lines show against.
const KIND_ROW_CLASS: Record<DiffLine["kind"], string> = {
  add: "bg-green-500/10",
  remove: "bg-destructive/10",
  context: "",
};

const KIND_SIGN: Record<DiffLine["kind"], string> = {
  add: "+",
  remove: "-",
  context: " ",
};

function gutter(n: number | null): string {
  return n === null ? "" : String(n);
}

// Where each hunk's lines begin in a count running across the whole diff, so a
// per-line index can be read without mutating a counter during render. The
// highlight cap then bounds the diff as a whole, not each hunk on its own.
function hunkStartIndices(hunks: { lines: unknown[] }[]): number[] {
  const starts: number[] = [];
  let total = 0;
  for (const hunk of hunks) {
    starts.push(total);
    total += hunk.lines.length;
  }
  return starts;
}

export function DiffView({
  filePath,
  patch,
  lineCap = DEFAULT_LINE_CAP,
  highlightCap = DEFAULT_HIGHLIGHT_CAP,
}: DiffViewProps) {
  const [showAll, setShowAll] = useState(false);
  const { hunks, hiddenLines } = buildDiff(
    patch,
    showAll ? Number.POSITIVE_INFINITY : lineCap
  );

  // Null until the lazy highlighter lands, and forever for a path whose
  // language we do not recognise — the diff renders plain in both cases. A diff
  // only mounts once expanded, so a chat that opens none never loads it (#240).
  const highlight = useHighlighter(filePath);

  // A new file is all additions, so its old-side gutter is empty on every row.
  // Dropping it leaves a single new-side gutter rather than a dead column.
  const hasOldColumn = hunks.some((hunk) =>
    hunk.lines.some((line) => line.oldLineNumber !== null)
  );

  const hunkStart = hunkStartIndices(hunks);

  return (
    <div className="overflow-x-auto rounded bg-card font-mono text-xs">
      <div className="border-b border-border px-2 py-1 text-muted-foreground">
        {filePath}
      </div>
      {hunks.map((hunk, hunkIndex) => (
        <div
          key={hunkIndex}
          // A hairline between hunks stands in for the gap they span in the file,
          // so two hunks don't read as one continuous stretch.
          className={hunkIndex > 0 ? "border-t border-border" : undefined}
        >
          {hunk.lines.map((line, lineIndex) => {
            // Past the cap the line renders plain, so revealing a very long
            // diff is never blocked on colouring every one of them. The tint
            // stays on the row; the tokens colour only the text.
            const contentIndex = hunkStart[hunkIndex] + lineIndex;
            const highlighted =
              highlight && contentIndex < highlightCap
                ? highlight(line.text)
                : null;

            return (
              <div
                key={lineIndex}
                data-testid="diff-line"
                data-kind={line.kind}
                className={`flex ${KIND_ROW_CLASS[line.kind]} ${
                  line.kind === "context"
                    ? "text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {hasOldColumn && (
                  <span
                    data-testid="diff-old-gutter"
                    className="w-8 shrink-0 select-none px-1 text-right tabular-nums text-muted-foreground"
                  >
                    {gutter(line.oldLineNumber)}
                  </span>
                )}
                <span className="w-8 shrink-0 select-none px-1 text-right tabular-nums text-muted-foreground">
                  {gutter(line.newLineNumber)}
                </span>
                <span className="w-3 shrink-0 select-none text-center text-muted-foreground">
                  {KIND_SIGN[line.kind]}
                </span>
                {highlighted !== null ? (
                  <span
                    className="whitespace-pre pr-2"
                    // The token spans carry only colour; the row's tint and the
                    // reader's text selection are untouched.
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                ) : (
                  <span className="whitespace-pre pr-2">{line.text}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {hiddenLines > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full cursor-pointer border-t border-border px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          Show {hiddenLines} more {hiddenLines === 1 ? "line" : "lines"}
        </button>
      )}
    </div>
  );
}
