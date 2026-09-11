/**
 * The seam every API response body passes through (ADR-0027). `readJson` is the
 * only caller of `res.json()`; `fetchJson` wraps it for the common case of a
 * read that needs nothing from a failed response. A body is `unknown` until a
 * parser from `./parse` has checked it, so a hook receives a typed model or
 * `null` — never a shape the server was only assumed to send.
 */
export type Parse<T> = (body: unknown) => T | null;

/** Parse a response body; `null` when it is not JSON or not the expected shape. */
export async function readJson<T>(
  res: Response,
  parse: Parse<T>
): Promise<T | null> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  return parse(body);
}

/**
 * Fetch and parse in one step; `null` on a non-OK status or a body of the wrong
 * shape. A network failure still rejects, so callers keep their own retry and
 * last-known-value handling.
 */
export async function fetchJson<T>(
  input: string,
  parse: Parse<T>,
  init?: RequestInit
): Promise<T | null> {
  const res = await fetch(input, init);
  if (!res.ok) return null;
  return readJson(res, parse);
}
