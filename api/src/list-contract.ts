/**
 * The wire contract for the keyset list endpoint, shared by the server and the
 * browser client. This file has no runtime dependencies on purpose: the web
 * bundle imports it directly (via the `@contract` alias) so the two sides can
 * never drift. Keep it free of node-only imports.
 */

/**
 * Upper bound on a single page's `limit`. The server rejects a larger `?limit=`
 * with 400; the client clamps any window-sized refresh to it. Duplicating this
 * across the two sides re-introduced the blank-screen crash fixed in #147, so it
 * lives here once (issue #143).
 */
export const MAX_PAGE_LIMIT = 200;
