import { useLanguageHighlighter } from "@/conversation/codeHighlight";

interface JsonViewProps {
  /** The value to show. A tool call's input, in practice. */
  value: unknown;
  /**
   * How many lines get syntax highlighting. Lines past this cap render plain,
   * so an unusually large input never delays the expansion (#251).
   */
  highlightCap?: number;
}

const DEFAULT_HIGHLIGHT_CAP = 500;

/**
 * A value serialised as JSON, one line per row.
 *
 * The language is not inferred here the way a file's is: the block is produced
 * by serialising the value, so it is always well-formed JSON (#251).
 */
export function JsonView({
  value,
  highlightCap = DEFAULT_HIGHLIGHT_CAP,
}: JsonViewProps) {
  const lines = JSON.stringify(value, null, 2).split("\n");

  // Null until the lazy highlighter lands — the JSON renders plain until then,
  // so colour only ever arrives as an improvement.
  const highlight = useLanguageHighlighter("json");

  return (
    <div
      data-testid="json-input"
      className="overflow-x-auto rounded bg-card p-2 font-mono text-xs text-muted-foreground"
    >
      {lines.map((line, index) => {
        const highlighted =
          highlight && index < highlightCap ? highlight(line) : null;

        return highlighted !== null ? (
          <div
            key={index}
            data-testid="json-line"
            className="whitespace-pre"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <div key={index} data-testid="json-line" className="whitespace-pre">
            {line}
          </div>
        );
      })}
    </div>
  );
}
