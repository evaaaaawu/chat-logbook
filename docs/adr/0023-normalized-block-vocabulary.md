# Normalized block vocabulary is the agent-agnostic rendering contract

Agent logs carry more than text: slash-command invocations, harness notifications, pasted images, file mentions — each written in that Agent's private markup (Claude Code wraps commands in `<command-message>` tags, injects `<task-notification>` blobs as fake user turns, and spells file mentions `@"path"`). The conversation UI must render these differently from prose, so _something_ has to classify them. We decided that classification happens at normalize time, inside the Agent's Plugin, by translating private markup into a small shared block vocabulary — never at render time in the frontend.

The vocabulary extends the existing four block kinds additively:

```ts
type NormalizedBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      toolUseId: string;
      content: unknown;
      isError?: boolean;
    }
  // New kinds:
  | { type: "command"; name: string; args: string }
  | { type: "system"; kind: string; summary: string; detail: string }
  | { type: "image"; mediaType: string; ref: string };
```

- **`command`** — a slash-command invocation (`name: "/tdd"`, `args: "issue 161"`). Renders as a chip.
- **`system`** — harness noise addressed to the Agent, not written by the user (task-notifications, hook output, …). `kind` is an open string (e.g. `"task-notification"`), so new noise types widen the data, not the type union. `summary` is the one-line collapsed row; `detail` is the full original content, preserved for expansion. Renders as a collapsed system row.
- **`image`** — metadata only. The bytes stay in the Raw layer (they are already there verbatim); `ref` is an opaque token the image endpoint resolves back to the bytes' location in the message's Raw row. Never inline base64 into Normalized: it would double the Archive's image storage and force the messages API to ship every image up front. Served by `GET /api/chats/:chatId/images/:ref` with immutable cache headers — archived bytes never change.

Two adjacent rules ride on the same contract:

- **Inline file mentions.** Agent-private file-mention syntax is translated at normalize time into a standard markdown link with a `file://` URL inside the `text` block. The renderer has exactly one generic rule — `file://` links render as a file chip — and never sees the Agent's syntax.
- **`NormalizedMessage.model`** — an optional field capturing the model id the Agent recorded on the message (e.g. `claude-opus-4-8`). Absent when the Agent doesn't record one.

The API serves these shapes as-is (with `tool_result.toolUseId` mapped to wire-form `tool_use_id`, matching the existing convention).

## Considered alternatives

**Render-time classification (frontend regex over text blocks).** Rejected: every new Agent would add per-agent parsing to the frontend, the data stays dirty in the Archive, and the same classification re-runs on every render. The Raw/Normalized split (ADR-0004) already gives us the right seam — classification is parsing, and parsing happens at ingestion.

## Consequences

- The vocabulary is a cross-layer contract (Plugin → Archive schema → API → frontend). Additions touch the whole line, so it stays deliberately small: prefer widening an existing kind (a new `system.kind` value) over adding a block type.
- Changing normalize output only takes effect after re-normalizing from Raw. The re-normalize mechanism is built by the first consumer slice (#191) and reused by every later vocabulary change; it never touches Raw rows or Source.
- Schema changes stay additive, per the public-export-format contract (ADR-0003).
- A new Agent plugin ships with zero frontend changes as long as it speaks this vocabulary — the frontend renders block kinds, not Agents.
