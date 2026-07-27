import type { ActionObject } from "@/types";

interface RowLabelProps {
  /** What the call did, as the word the reader sees. */
  verb: string;
  /** What it did it to, if it named anything. */
  object?: ActionObject;
}

/**
 * The label as one string.
 *
 * Quoting a phrase keeps `Searched for "npm test"` from reading as if the
 * words were ours. A path stands unquoted — it is already a name.
 */
function oneLine(verb: string, object?: ActionObject): string {
  if (!object) return verb;
  if (object.type === "phrase") return `${verb} "${object.value}"`;
  return `${verb} ${object.value}`;
}

/**
 * The row's one line: what happened, then what it happened to.
 *
 * A path with a directory in it gets three slots rather than one string,
 * because a single truncating span clips the end — and the end of a path is
 * the filename, the one part that identifies it (#262). The verb holds its
 * width, the directory absorbs the squeeze, the filename holds its width. The
 * diff stat already sits outside what truncates for the same reason (#250);
 * this is that trick one slot further left.
 *
 * Everything else — a phrase, a bare filename, a verb on its own — has no
 * directory to give up, so it stays one slot and truncates from the end as
 * before.
 */
export function RowLabel({ verb, object }: RowLabelProps) {
  if (object?.type === "path") {
    const slash = object.value.lastIndexOf("/");
    if (slash > 0) {
      return (
        <span data-testid="row-label" className="flex min-w-0">
          <span data-testid="row-label-verb" className="shrink-0">
            {verb}
          </span>
          {/* Unbreakable, because a plain space between two flex items is
              whitespace the layout drops — and a space at the end of the verb
              is whitespace the accessible name trims. */}
          {" "}
          <span className="flex min-w-0">
            {/* Reversing the box puts the ellipsis at the line's end, which in
                an RTL box is its left edge. The path itself is isolated back
                to LTR, so its slashes stay where they were written. */}
            <span
              data-testid="row-label-dir"
              className="min-w-0 truncate [direction:rtl]"
            >
              <bdi dir="ltr">{object.value.slice(0, slash)}</bdi>
            </span>
            {/* The separator travels with the name, so what survives a squeeze
                still reads as a path rather than as a bare word. */}
            <span data-testid="row-label-name" className="shrink-0">
              {object.value.slice(slash)}
            </span>
          </span>
        </span>
      );
    }
  }

  // It owns its truncation rather than leaning on the row's, so either shape
  // of label is one measurable box.
  return (
    <span data-testid="row-label" className="block truncate">
      {oneLine(verb, object)}
    </span>
  );
}
