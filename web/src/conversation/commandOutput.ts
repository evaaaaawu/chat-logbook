export interface CappedOutput {
  lines: string[];
  /** Lines held back past the cap; 0 when the whole output renders. */
  hiddenLines: number;
}

/**
 * Bound a block of plain output to a number of lines.
 *
 * What a command printed carries no structure to lift out — no line numbers, no
 * added/removed sides — so unlike a file excerpt this only counts. The overflow
 * comes back as `hiddenLines` so the view can offer to reveal the rest (#252).
 */
export function capLines(output: string, lineCap: number): CappedOutput {
  const all = output.split("\n");
  const lines = all.slice(0, lineCap);
  return { lines, hiddenLines: all.length - lines.length };
}
