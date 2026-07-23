import { useState } from "react";
import type { PatchHunk } from "@/types";
import { buildDiff, type DiffLine } from "@/conversation/diffModel";

interface DiffViewProps {
  filePath: string;
  patch: PatchHunk[];
  /**
   * Most content lines rendered before the rest is folded behind a reveal
   * control. A long edit is capped so it cannot stall the pane; the reader
   * opts into the tail (#237).
   */
  lineCap?: number;
}

const DEFAULT_LINE_CAP = 40;

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

export function DiffView({
  filePath,
  patch,
  lineCap = DEFAULT_LINE_CAP,
}: DiffViewProps) {
  const [showAll, setShowAll] = useState(false);
  const { hunks, hiddenLines } = buildDiff(
    patch,
    showAll ? Number.POSITIVE_INFINITY : lineCap
  );

  // A new file is all additions, so its old-side gutter is empty on every row.
  // Dropping it leaves a single new-side gutter rather than a dead column.
  const hasOldColumn = hunks.some((hunk) =>
    hunk.lines.some((line) => line.oldLineNumber !== null)
  );

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
          {hunk.lines.map((line, lineIndex) => (
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
              <span className="whitespace-pre pr-2">{line.text}</span>
            </div>
          ))}
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
