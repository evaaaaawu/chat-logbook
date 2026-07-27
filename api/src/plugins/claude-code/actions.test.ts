import { describe, it, expect } from "vitest";
import { ClaudeCodePlugin } from "./plugin.js";
import type { NormalizedBlock, RawRecord } from "../types.js";

const plugin = new ClaudeCodePlugin();

function rawRecord(payload: unknown): RawRecord {
  return {
    sourceId: "session-1",
    sourcePath: "/fake/session-1.jsonl",
    sourceLocator: "L1",
    payload,
  };
}

/** The Action the plugin gave the one tool call in a normalized assistant turn. */
function actionOf(name: string, input: unknown) {
  const message = plugin.normalize(
    rawRecord({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name, input }],
      },
      uuid: "msg-1",
      timestamp: "2024-01-01T00:00:00Z",
    })
  );
  const block = message?.blocks[0] as Extract<
    NormalizedBlock,
    { type: "tool_use" }
  >;
  return block.action;
}

describe("Actions the Claude Code plugin gives a tool call", () => {
  it("calls a shell command an execute, named by what the call said it was for", () => {
    expect(
      actionOf("Bash", {
        command: 'sqlite3 archive.db "SELECT name FROM sqlite_master"',
        description: "List archive tables",
      })
    ).toEqual({
      kind: "execute",
      object: { type: "phrase", value: "List archive tables" },
    });
  });

  it("falls back to the command's first line when the call described nothing", () => {
    expect(
      actionOf("Bash", {
        command: "pnpm test \\\n  --reporter=verbose",
      })
    ).toEqual({
      kind: "execute",
      object: { type: "phrase", value: "pnpm test \\" },
    });
  });

  // Three acts the reader tells apart at a glance: a local replacement, a whole
  // file written, and a file only looked at. Each names the file as a path, so
  // the UI knows it may drop leading directories rather than the filename.
  it.each([
    ["Edit", "edit"],
    ["MultiEdit", "edit"],
    ["Write", "write"],
    ["Read", "read"],
  ])("calls %s a %s of the file it names", (name, kind) => {
    expect(actionOf(name, { file_path: "/repo/web/src/types.ts" })).toEqual({
      kind,
      object: { type: "path", value: "/repo/web/src/types.ts" },
    });
  });

  // A search names what was looked for, not where — so it is a phrase, and it
  // reads as `Searched for "…"` rather than as a file the Agent opened.
  it.each([
    ["Grep", { pattern: "useMessages" }],
    ["Glob", { pattern: "useMessages" }],
    ["WebSearch", { query: "useMessages" }],
    ["ToolSearch", { query: "useMessages" }],
  ])("calls %s a search for what it was given", (name, input) => {
    expect(actionOf(name, input)).toEqual({
      kind: "search",
      object: { type: "phrase", value: "useMessages" },
    });
  });

  // Handing work to another agent, named by the task rather than by which
  // agent took it — the task is what the reader is scanning for.
  it.each([
    [
      "Agent",
      { subagent_type: "Explore", description: "Research the plugins" },
    ],
    ["SendMessage", { to: "a24a", summary: "Research the plugins" }],
  ])("calls %s a delegation of the task it names", (name, input) => {
    expect(actionOf(name, input)).toEqual({
      kind: "delegate",
      object: { type: "phrase", value: "Research the plugins" },
    });
  });

  // MCP tool names are unbounded — they come from whichever servers the reader
  // installed — so `other` is permanent rather than a gap waiting to be filled.
  // The server is the part that means something; the tool half is that server's
  // own internal action name, and `mcp__` is transport.
  it.each([
    ["mcp__Claude_Browser__computer", "Claude Browser"],
    ["mcp__context7__query-docs", "context7"],
    ["mcp__ccd_session_mgmt__search_session_transcripts", "ccd session mgmt"],
  ])("names %s after the server behind it", (name, server) => {
    expect(actionOf(name, { action: "screenshot" })).toEqual({
      kind: "other",
      object: { type: "phrase", value: server },
    });
  });

  // Fetching a URL is reading, so it shares the kind — but a URL is a phrase,
  // not a path: what identifies it sits at the front, so the UI must not treat
  // its leading parts as droppable the way it does a directory.
  it("calls a fetched URL a read, and keeps the URL whole", () => {
    expect(
      actionOf("WebFetch", { url: "https://example.com/docs/api" })
    ).toEqual({
      kind: "read",
      object: { type: "phrase", value: "https://example.com/docs/api" },
    });
  });

  // A built-in with no mapping keeps its own name, which is already written for
  // a reader. Skill lands here rather than under delegate: it sometimes loads
  // instructions into the current turn and sometimes hands off, so calling it a
  // delegation would be wrong half the time.
  it.each(["Skill", "TaskCreate", "AskUserQuestion"])(
    "keeps %s's own name when nothing else describes it",
    (name) => {
      expect(actionOf(name, { some: "input" })).toEqual({
        kind: "other",
        object: { type: "phrase", value: name },
      });
    }
  );
});
