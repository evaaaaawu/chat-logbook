import type { ContentBlock, PatchHunk } from "@/types";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;
type ToolResultBlock = Extract<ContentBlock, { type: "tool_result" }>;

// A file edit reads better as what changed than as which tool ran, so a result
// carrying a patch names the act and the shape of it. `Wrote` covers both of
// Write's cases — a new file and an overwrite — where `Created` would be wrong
// for one of them.
const EDIT_VERBS: Record<string, string> = {
  Edit: "Edited",
  MultiEdit: "Edited",
  Write: "Wrote",
};

/** How big an edit was, in lines. */
export interface DiffStat {
  added: number;
  removed: number;
}

export interface ToolSummary {
  /** The one-line description: the verb and what it applied to. */
  label: string;
  /**
   * The counts, kept out of the label so the row can place them at its trailing
   * edge — where a truncating path cannot push them off the end (#250).
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

function basename(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  return slash === -1 ? filePath : filePath.slice(slash + 1);
}

const MAX_DETAIL_LENGTH = 100;

function truncate(text: string): string {
  if (text.length <= MAX_DETAIL_LENGTH) return text;
  return text.slice(0, MAX_DETAIL_LENGTH) + "…";
}

function getInput(input: unknown): Record<string, unknown> {
  if (typeof input === "object" && input !== null) {
    return input as Record<string, unknown>;
  }
  return {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function generateToolSummary(
  block: ToolUseBlock,
  result?: ToolResultBlock
): ToolSummary {
  const { name } = block;
  const input = getInput(block.input);

  const verb = EDIT_VERBS[name];
  if (verb && result?.file_path && result.patch?.length) {
    return {
      label: `${verb} ${basename(result.file_path)}`,
      diffStat: countLines(result.patch),
    };
  }

  const filePath = getString(input.file_path);
  if (filePath) return { label: `${name}: ${filePath}` };

  const command = getString(input.command);
  if (command) return { label: `${name}: ${truncate(command)}` };

  const pattern = getString(input.pattern);
  if (pattern) return { label: `${name}: ${pattern}` };

  return { label: name };
}
