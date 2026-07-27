import type {
  ActionKind,
  ActionObject,
  ContentBlock,
  PatchHunk,
} from "@/types";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;
type ToolResultBlock = Extract<ContentBlock, { type: "tool_result" }>;

/** How big an edit was, in lines. */
export interface DiffStat {
  added: number;
  removed: number;
}

export interface ToolSummary {
  /** What the call did, as the word the reader sees. */
  verb: string;
  /**
   * What it did it to, kept apart from the verb so a narrow row can shrink the
   * object without ever losing the verb (#262).
   */
  object?: ActionObject;
  /**
   * The counts, kept out of the label so the row can place them at its trailing
   * edge — where a truncating object cannot push them off the end (#250).
   */
  diffStat?: DiffStat;
}

function countLines(patch: PatchHunk[]): DiffStat {
  let added = 0;
  let removed = 0;
  for (const hunk of patch) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) added += 1;
      else if (line.startsWith("-")) removed += 1;
    }
  }
  return { added, removed };
}

// The wording lives here rather than in the stored Action, so changing a word
// is a frontend edit and not a re-normalize of the whole archive (ADR-0025).
// `Wrote` covers both of write's cases — a new file and an overwrite — where
// `Created` would be wrong for one of them.
const VERBS: Record<ActionKind, string> = {
  edit: "Edited",
  write: "Wrote",
  read: "Read",
  search: "Searched for",
  execute: "Ran",
  delegate: "Delegated",
  other: "Used",
};

export function generateToolSummary(
  block: ToolUseBlock,
  result?: ToolResultBlock
): ToolSummary {
  const action = block.action;
  const patch = result?.patch;
  return {
    verb: VERBS[action?.kind ?? "other"],
    ...(action?.object ? { object: action.object } : {}),
    ...(patch?.length ? { diffStat: countLines(patch) } : {}),
  };
}
