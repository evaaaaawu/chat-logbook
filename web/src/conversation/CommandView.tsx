import { useState } from "react";
import { useLanguageHighlighter } from "@/conversation/codeHighlight";
import { capLines } from "@/conversation/commandOutput";

interface CommandViewProps {
  /** The shell command the unit ran. */
  command: string;
  /** What the command printed, verbatim. */
  output?: string;
  /**
   * Most output lines rendered before the rest is folded behind a reveal
   * control. A command that prints thousands of lines is capped so it cannot
   * stall the pane; the reader opts into the tail, as with a long diff (#252).
   */
  lineCap?: number;
}

const DEFAULT_LINE_CAP = 40;

/**
 * A Bash unit: the command that ran, as shell, and what it said back.
 *
 * The command's language is known at the call site rather than inferred from a
 * path — a Bash unit's command is always shell. The output gets no language at
 * all: it is whatever the command happened to print, and guessing would only
 * guess wrong (#252).
 */
export function CommandView({
  command,
  output,
  lineCap = DEFAULT_LINE_CAP,
}: CommandViewProps) {
  const [showAll, setShowAll] = useState(false);

  // Null until the lazy highlighter lands — the command renders plain until
  // then, so colour only ever arrives as an improvement.
  const highlight = useLanguageHighlighter("bash");

  // A command that printed nothing gets no block at all, rather than an empty
  // one below the command — the same reason a read drops a dead gutter (#252).
  const printed = output?.trim() ? output : undefined;

  const { lines: outputLines, hiddenLines } = capLines(
    printed ?? "",
    showAll ? Number.POSITIVE_INFINITY : lineCap
  );

  return (
    <>
      <div
        data-testid="command"
        className="overflow-x-auto rounded bg-card p-2 font-mono text-xs text-foreground"
      >
        {command.split("\n").map((line, index) => {
          const highlighted = highlight ? highlight(line) : null;

          return highlighted !== null ? (
            <div
              key={index}
              data-testid="command-line"
              className="whitespace-pre"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <div
              key={index}
              data-testid="command-line"
              className="whitespace-pre"
            >
              {line}
            </div>
          );
        })}
      </div>
      {printed !== undefined && (
        <div
          data-testid="command-output"
          className="overflow-x-auto rounded bg-card py-1 font-mono text-xs text-muted-foreground"
        >
          {outputLines.map((line, index) => (
            <div
              key={index}
              data-testid="output-line"
              className="whitespace-pre px-2"
            >
              {line}
            </div>
          ))}
          {hiddenLines > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full cursor-pointer border-t border-border px-2 py-1 text-left transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              Show {hiddenLines} more {hiddenLines === 1 ? "line" : "lines"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
