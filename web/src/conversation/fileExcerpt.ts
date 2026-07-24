/**
 * One line of a file as a Read tool reported it.
 *
 * `lineNumber` is the file's own number, taken from the prefix the tool wrote —
 * not a running count from one, so an excerpt that starts at line 40 says so.
 * It is `null` when the result carries no numbering at all, which is how a
 * result that is not a file excerpt still renders (#240).
 */
export interface ExcerptLine {
  lineNumber: number | null;
  text: string;
}

export interface FileExcerpt {
  lines: ExcerptLine[];
  /** Lines dropped past the cap; 0 when the whole excerpt renders. */
  hiddenLines: number;
}

// A Read result numbers each line as `<n>\t<content>`. Anchored to the start of
// the line, so a tab inside the content itself is left alone.
const NUMBERED_LINE = /^(\d+)\t(.*)$/;

/**
 * Turn a Read result into numbered lines, bounded by a cap.
 *
 * Whether the result is numbered is decided once, from the first line, rather
 * than per line: a file whose own text happens to open with digits and a tab
 * would otherwise have that read as a line number partway down. `lineCap`
 * bounds the lines rendered and reports the overflow as `hiddenLines`, so the
 * view can offer to reveal the rest — the same bargain a long diff strikes.
 */
export function buildExcerpt(content: string, lineCap: number): FileExcerpt {
  const rawLines = content.split("\n");
  const numbered = NUMBERED_LINE.test(rawLines[0] ?? "");

  const kept = rawLines.slice(0, lineCap);
  const lines = kept.map((raw) => {
    const match = numbered ? NUMBERED_LINE.exec(raw) : null;
    if (!match) return { lineNumber: null, text: raw };
    return { lineNumber: Number(match[1]), text: match[2] };
  });

  return { lines, hiddenLines: Math.max(0, rawLines.length - kept.length) };
}
