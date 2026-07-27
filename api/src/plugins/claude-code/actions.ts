import { mcpServerName } from "../mcp-tool-name.js";
import type { Action, ActionKind } from "../types.js";

function getString(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

// Write covers both a new file and an overwrite, which is why it stays apart
// from edit: a reader scanning a Run wants to see that the last of three
// touches rewrote the file rather than patched it (#260).
const FILE_KINDS: Record<string, ActionKind> = {
  Edit: "edit",
  MultiEdit: "edit",
  Write: "write",
  Read: "read",
};

// Kept apart from read, unlike the fold summary that merges the two (#199):
// a search's object is what was looked for, and `Read "useMessages"` does not
// parse. The summary merges them at render, where wording belongs.
const SEARCH_TOOLS = new Set(["Grep", "Glob", "WebSearch", "ToolSearch"]);

function firstLine(text: string | undefined): string | undefined {
  return text?.split("\n", 1)[0];
}

/** An object clause, omitted entirely when there is nothing to name. */
function phrase(value: string | undefined) {
  return value ? { object: { type: "phrase" as const, value } } : {};
}

function path(value: string | undefined) {
  return value ? { object: { type: "path" as const, value } } : {};
}

/**
 * The Action behind one Claude Code tool call (ADR-0025).
 *
 * This is the whole of what the frontend needs to know about Claude Code's tool
 * names — nothing downstream ever sees them again.
 */
export function toolAction(name: string, input: unknown): Action {
  if (name === "Bash") {
    // The description is what the call said it was for, and nearly every call
    // carries one. The command itself is the worse label: most run past a
    // readable width and many are several lines (#260).
    const said =
      getString(input, "description") ?? firstLine(getString(input, "command"));
    return { kind: "execute", ...phrase(said) };
  }

  if (name === "Agent" || name === "SendMessage") {
    const task = getString(input, "description") ?? getString(input, "summary");
    return { kind: "delegate", ...phrase(task) };
  }

  if (SEARCH_TOOLS.has(name)) {
    const looked = getString(input, "pattern") ?? getString(input, "query");
    return { kind: "search", ...phrase(looked) };
  }

  const fileKind = FILE_KINDS[name];
  if (fileKind) {
    return { kind: fileKind, ...path(getString(input, "file_path")) };
  }

  if (name === "WebFetch") {
    return { kind: "read", ...phrase(getString(input, "url")) };
  }

  return { kind: "other", ...phrase(mcpServerName(name) ?? name) };
}
