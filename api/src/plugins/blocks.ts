/**
 * The Block vocabulary every Plugin normalizes into and the messages API serves
 * (ADR-0023). Pure types with no imports, so the web bundle can reach them
 * through the wire contract (`../wire-types.ts`) without pulling in Node.
 */

/**
 * One hunk of a unified diff, in the shape every Agent's patch already speaks:
 * where the hunk starts on each side, how many lines it covers, and the lines
 * themselves with their `+`/`-`/` ` prefixes.
 */
export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * What a Tool unit did, said in a way no Agent owns (ADR-0025).
 *
 * Every Plugin translates its own Agent's tool names into this set, so the UI
 * renders Actions and never tool names. `execute` rather than `run` because Run
 * already names the visual grouping of skim-layer rows.
 */
export type ActionKind =
  | "edit"
  | "write"
  | "read"
  | "search"
  | "execute"
  | "delegate"
  | "other";

/**
 * What an Action applied to. A path says the value is a file location, which is
 * the UI's cue that it may drop leading directories to fit — a phrase has no
 * such structure and truncates from the end. A URL is a phrase for that reason:
 * its identifying part is at the front.
 */
export type ActionObject =
  | { type: "path"; value: string }
  | { type: "phrase"; value: string };

export interface Action {
  kind: ActionKind;
  /** Absent when the call named nothing to act on. */
  object?: ActionObject;
  /**
   * The verbatim input the expanded view renders, when the object is a label
   * rather than the input itself (#263). A shell command's description is the
   * better row label and the command is the better thing to expand onto, so an
   * `execute` carries both. Absent where the object already is the input — a
   * read's path names the very file the excerpt renders.
   */
  detail?: string;
}

export type NormalizedBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
      /**
       * Required here because every call has one — an unrecognized tool is
       * `other`, not nothing. Optional on the read side, where rows normalized
       * before this field existed are still in flight until re-normalize runs.
       */
      action: Action;
    }
  | {
      type: "tool_result";
      toolUseId: string;
      content: unknown;
      /**
       * Set when the tool reported a failure. Omitted on success, so the flag
       * only ever widens a stored block (ADR-0023).
       */
      isError?: boolean;
      /**
       * The file a file-editing tool applied to, and the unified-diff hunks it
       * produced (ADR-0023). Carried together or not at all: a result that
       * edited no file has neither. Kept verbatim from the Agent's own patch —
       * the real line numbers are what the diff view renders from, and nothing
       * in the call itself can recover them.
       */
      filePath?: string;
      patch?: PatchHunk[];
    }
  // A slash-command invocation, translated from the Agent's private markup at
  // normalize time so the frontend never parses it (ADR-0023). Renders as a chip.
  | { type: "command"; name: string; args: string }
  // Harness noise addressed to the Agent rather than written by the reader —
  // task notifications, local command echoes. `kind` is an open string so a new
  // noise type widens the data, not the type union (ADR-0023). `summary` is the
  // collapsed one-liner; `detail` is the original content, kept for expansion.
  | { type: "system"; kind: string; summary: string; detail: string }
  // An inline image, metadata only (ADR-0023). The bytes stay in the Raw layer
  // where the Agent already wrote them verbatim; `ref` is an opaque token the
  // image endpoint resolves back to their location in the message's Raw row.
  // Never inline base64 here: it would double the Archive's image storage and
  // force the messages API to ship every image up front.
  | { type: "image"; mediaType: string; ref: string };

type NormalizedToolUse = Extract<NormalizedBlock, { type: "tool_use" }>;

/**
 * A block as the Archive holds it and the read side sees it: the same
 * vocabulary as `NormalizedBlock`, except that a tool call's `action` may be
 * missing. Rows normalized before Actions existed lack it until re-normalize
 * catches up (ADR-0023), so the read side must handle its absence.
 */
export type StoredBlock =
  | Exclude<NormalizedBlock, { type: "tool_use" }>
  | (Omit<NormalizedToolUse, "action"> & { action?: Action });
