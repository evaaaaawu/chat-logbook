import { useState } from "react";
import { buildExcerpt } from "@/conversation/fileExcerpt";
import { useHighlighter } from "@/conversation/codeHighlight";

interface FileExcerptViewProps {
  filePath: string;
  /** The Read result verbatim, line numbers and all. */
  content: string;
  /**
   * Most lines rendered before the rest is folded behind a reveal control. A
   * whole file read into the pane is capped so it cannot stall it; the reader
   * opts into the tail, as with a long diff (#240).
   */
  lineCap?: number;
  /**
   * How many rendered lines get syntax highlighting. Lines past this cap render
   * plain, so revealing a very long file is never blocked on colouring all of
   * it (#240).
   */
  highlightCap?: number;
}

const DEFAULT_LINE_CAP = 40;
const DEFAULT_HIGHLIGHT_CAP = 500;

function gutter(n: number | null): string {
  return n === null ? "" : String(n);
}

/**
 * A file as a Read tool reported it: the path, then its numbered lines.
 *
 * The same shape a diff renders in — path header, line-number gutter, code —
 * minus the added/removed grounds, which a read has no use for. Sharing the
 * layout is the point: a file looks like a file wherever the pane shows one.
 */
export function FileExcerptView({
  filePath,
  content,
  lineCap = DEFAULT_LINE_CAP,
  highlightCap = DEFAULT_HIGHLIGHT_CAP,
}: FileExcerptViewProps) {
  const [showAll, setShowAll] = useState(false);
  const { lines, hiddenLines } = buildExcerpt(
    content,
    showAll ? Number.POSITIVE_INFINITY : lineCap
  );

  // Null until the lazy highlighter lands, and forever for a path whose
  // language we do not recognise — the excerpt renders plain in both cases.
  const highlight = useHighlighter(filePath);

  // A result with no numbering is not a file excerpt; dropping the gutter
  // leaves it reading as the plain output it is, rather than a dead column.
  const hasGutter = lines.some((line) => line.lineNumber !== null);

  return (
    <div className="overflow-x-auto rounded bg-card font-mono text-xs">
      <div className="border-b border-border px-2 py-1 text-muted-foreground">
        {filePath}
      </div>
      {lines.map((line, index) => {
        const highlighted =
          highlight && index < highlightCap ? highlight(line.text) : null;

        return (
          <div
            key={index}
            data-testid="excerpt-line"
            className="flex text-foreground"
          >
            {hasGutter && (
              <span className="w-10 shrink-0 select-none px-1 text-right tabular-nums text-muted-foreground">
                {gutter(line.lineNumber)}
              </span>
            )}
            {highlighted !== null ? (
              <span
                className="whitespace-pre pr-2"
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            ) : (
              <span className="whitespace-pre pr-2">{line.text}</span>
            )}
          </div>
        );
      })}
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
