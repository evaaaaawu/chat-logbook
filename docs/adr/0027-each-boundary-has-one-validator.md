# Each boundary has one validator, chosen by who wrote the data

Data enters chat-logbook at six kinds of boundary: an Agent's Source records, HTTP request bodies, API responses read by the web app, `localStorage`, DOM events, and SQLite rows. Until #278 most of them narrowed with `as`, which claims a shape nobody checked. The coding style says to reach for the repo's schema library at a boundary, and the repo had none. So the real question was which boundaries need a schema library, which need something lighter, and which need nothing.

**The validator follows who wrote the data.**

- **Agent Source records: a schema library (zod).** Claude Code's JSONL is written by a vendor, nested several levels deep, full of optional fields, and changes without notice. Here the schema is the only place the format is written down, and hand-written guards for a shape this deep drift from it quietly. Each Plugin parses its records with `safeParse`. It never uses `parse`, because a changed Source format must never stop ingestion.
- **Everything else we wrote ourselves: named `isX`/`hasX` guards.** API responses, request bodies, stored preferences, and DOM events all carry shapes this repo defines. They are flat and they change only in a commit that also changes the reader. A guard verifies every field its name claims. It lives beside the type it proves, and it adds no dependency to the web bundle. The web app reads every API response body through one seam: `readJson(res, parse)`, or `fetchJson(url, parse)`, which wraps it when the caller needs nothing from a failed response. Either way a hook receives a typed model or nothing. The API reads request bodies field by field through `isRecord`, and never casts one to its expected shape.
- **SQLite rows: no validator.** Our own migrations write these tables, the same process reads them, and the list pipeline reads them on every page at 100k Chats. The row type is declared where the query is written: `prepare<Params, Row>()` for raw SQL, and `$type<>()` on a Drizzle column whose JSON or text holds a narrower shape. The claim still goes unchecked at runtime. But it now sits beside the SQL that produces it, so one reading checks both, and a mismatch is a migration bug the store's tests catch — not user data.

## How an Agent record degrades

A Source format change must never stop a Chat from opening. The Plugin reads what it recognizes and ignores the rest:

- Unknown fields are ignored: record schemas are loose objects.
- A record that fails its schema normalizes to nothing, the same as a record type the Plugin does not render. Its Raw row is still stored, so a later parser fix picks it up through re-normalize.
- A content block that fails its schema is dropped, and the rest of the Message survives.
- A tool call's `input` and a tool result's `content` stay `unknown` all the way to the web app, which renders them as raw JSON. That is the raw rendering: the app shows what it cannot interpret instead of guessing at it.
- A line that is not valid JSON is skipped. This is usually the last line of a file the Agent is still writing, and the next Scan picks it up once the line is complete.

None of this changes the Normalized output, so it needs no `NORMALIZE_VERSION` bump.

## Considered options

- **Guards everywhere.** This adds no dependency. It was rejected for Agent records: that is the one boundary whose shape we do not own, and the nesting there makes a hand-written guard the likeliest to disagree with the format it checks.
- **A schema library everywhere.** This gives one idiom. It was rejected because it adds a validator to the web bundle for shapes our own server already produces, and it puts per-row parsing on the list pipeline's hot path.
- **Validate SQLite rows too.** This was rejected. It pays for every row on every page to catch a class of bug — schema and query out of step — that the store's own tests already catch before release.
- **Surface an unparseable block as a `system` row (`kind: "unparsed"`) instead of dropping it.** This would make a format change visible in the conversation. It was rejected for now: block types the Plugin drops on purpose would appear as noise, and it would change Normalized output for every archived Chat. It is still the right move if dropped content ever turns out to hide something you needed.

## Consequences

- `zod` is a dependency of `api` only. The web app does not import it.
- A new Plugin parses its Source with zod schemas and follows the degrade rules above.
- A new raw SQL read declares its row type on `prepare`. A cast on its result fails `no-unsafe-type-assertion`.
- A new API read in the web app goes through `fetchJson` or `readJson` with a parser.
