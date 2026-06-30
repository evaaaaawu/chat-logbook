/**
 * The base Title rule, shared by the read-time derivation (ChatReader) and the
 * denormalized Title sort key (ADR-0019). A chat's title, absent a custom one,
 * is the first line of its earliest user message — or the literal "Untitled"
 * when there is no usable text. Both the wire title and the stored `text_key`
 * derive from this one function so they can never drift.
 */
export function deriveBaseTitle(firstUserText: string | undefined): string {
  const text = firstUserText?.trim().split("\n")[0]?.trim();
  return text && text.length > 0 ? text : "Untitled";
}
