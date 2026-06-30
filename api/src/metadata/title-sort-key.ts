/**
 * The cross-store Title collation key (ADR-0019). A hand-rolled, deterministic
 * key built in Node and compared with SQLite's BINARY collation, so the Title
 * axis can keyset-paginate through an index range scan like the time axes — no
 * native ICU module, no scalar function in `ORDER BY`.
 *
 * The key is case- and accent-insensitive (matching today's
 * `sensitivity:"base"`) and keeps numeric ordering (matching `numeric:true`).
 * CJK drifts to code-point order deliberately — UTF-8 byte order equals
 * code-point order, which is not `zh-Hant` stroke/pinyin order; replicating
 * that needs ICU, which the ADR rejected for a local-first app.
 */

/**
 * Re-encode one maximal digit run so digit runs sort by numeric value under a
 * BINARY (lexical) compare. Leading zeros are dropped (insignificant), then the
 * core digits are prefixed with their length — and the length with *its* own
 * digit-count — so a shorter number always sorts before a longer one and equal
 * lengths fall back to a plain lexical (== numeric) compare:
 *
 *   "2"  -> "1" + "1" + "2"   = "112"
 *   "10" -> "1" + "2" + "10"  = "1210"   ("112" < "1210", so 2 < 10)
 *
 * The "length of the length" escape keeps the scheme correct for arbitrarily
 * long runs without a sentinel character, using only digit characters so a
 * numeric run still sorts ahead of any letter run.
 */
function encodeNumericRun(run: string): string {
  const core = run.replace(/^0+(?=\d)/, "");
  const len = String(core.length);
  return String(len.length) + len + core;
}

/**
 * Build the BINARY-collatable sort key for a title. Pure and deterministic: the
 * same input always yields the same key, so the stored `sort_key` column and a
 * freshly recomputed key always agree.
 */
export function computeSortKey(input: string): string {
  // NFKD then casefold: decomposes accented letters into base + combining mark
  // and folds case, so "Café" and "cafe" fold toward the same base letters.
  // Stripping the combining marks (\p{M}) makes the key accent-insensitive.
  // CJK needs no special handling — Han characters don't decompose, so they
  // survive as themselves and sort by code point (ADR-0019's accepted drift).
  const folded = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "");
  // Re-encode every digit run so numbers sort by value, not lexically.
  return folded.replace(/\d+/g, encodeNumericRun);
}
