import { describe, it, expect } from "vitest";
import type { Action, ContentBlock } from "@/types";
import { generateToolSummary } from "./generateToolSummary";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

function toolUse(action?: Action): ToolUseBlock {
  // The tool's name and input stay on the block, and the summary is expected to
  // ignore both: what the call did is the Action's to say, not the tool's.
  return {
    type: "tool_use",
    id: "t1",
    name: "Edit",
    input: { file_path: "/repo/web/src/types.ts" },
    ...(action ? { action } : {}),
  };
}

describe("generateToolSummary", () => {
  it("says what an edit did, and names the file as a path", () => {
    expect(
      generateToolSummary(
        toolUse({
          kind: "edit",
          object: { type: "path", value: "/repo/web/src/types.ts" },
        })
      )
    ).toEqual({
      verb: "Edited",
      object: { type: "path", value: "/repo/web/src/types.ts" },
    });
  });

  // One word per act, and the same word the fold summary above these rows uses.
  // `Wrote` stays apart from `Edited` because the difference is what a reader
  // scanning a Run is looking for: the last of three touches rewrote the file.
  it.each([
    ["write", "Wrote"],
    ["read", "Read"],
    ["search", "Searched for"],
    ["execute", "Ran"],
    ["delegate", "Delegated"],
    ["other", "Used"],
  ] as const)("says %s as %s", (kind, verb) => {
    expect(generateToolSummary(toolUse({ kind })).verb).toBe(verb);
  });

  // A row normalized before Actions existed, still in flight until re-normalize
  // catches up. It reads as an unremarkable call rather than reaching back for
  // the tool's name — that fallback is the machine register this replaced.
  it("treats a row with no Action as an unremarkable one, not as its tool", () => {
    const summary = generateToolSummary(toolUse());

    expect(summary.verb).toBe("Used");
    expect(summary.object).toBeUndefined();
  });

  // The counts come from the patch the result carried, not from the Action:
  // how big an edit was is a fact about what came back, and ADR-0023 keeps it
  // derived at render rather than stored.
  it("counts an edit's lines from the patch its result carried", () => {
    const summary = generateToolSummary(
      toolUse({
        kind: "edit",
        object: { type: "path", value: "/repo/web/src/types.ts" },
      }),
      {
        type: "tool_result",
        tool_use_id: "t1",
        content: "updated",
        file_path: "/repo/web/src/types.ts",
        patch: [
          {
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 3,
            lines: [" kept", "-gone", "+new", "+also new"],
          },
        ],
      }
    );

    expect(summary.diffStat).toEqual({ added: 2, removed: 1 });
  });
});
