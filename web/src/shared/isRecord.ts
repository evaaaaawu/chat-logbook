/**
 * The first step of parsing anything that crossed into the app — a stored
 * preference, an API body. Every key of the result reads as `unknown`, which is
 * all an unparsed object promises; the caller narrows the fields it needs
 * (ADR-0027).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
