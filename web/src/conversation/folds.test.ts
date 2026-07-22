import { describe, it, expect } from "vitest";
import type { ContentBlock, Message } from "@/types";
import { planFolds, planLayout } from "@/conversation/folds";

function message(id: string, content: ContentBlock[]): Message {
  return { id, role: "assistant", content, timestamp: "2026-07-22T00:00:00Z" };
}

function tool(id: string, name: string): Message {
  return message(id, [{ type: "tool_use", id, name, input: {} }]);
}

function bash(id: string): Message {
  return tool(id, "Bash");
}

function summaryOf(messages: Message[]): string | undefined {
  return planFolds(messages)[0]?.summary;
}

describe("planFolds", () => {
  it("folds three consecutive commands recorded as separate turns into one row", () => {
    const folds = planFolds([bash("t1"), bash("t2"), bash("t3")]);

    expect(folds).toEqual([
      {
        rows: [
          { messageId: "t1", blockIndex: 0 },
          { messageId: "t2", blockIndex: 0 },
          { messageId: "t3", blockIndex: 0 },
        ],
        summary: "Ran 3 commands",
      },
    ]);
  });

  it("leaves one or two units alone — folding them would only add a click", () => {
    expect(planFolds([bash("t1")])).toEqual([]);
    expect(planFolds([bash("t1"), bash("t2")])).toEqual([]);
  });

  it("breaks the count at thinking, which a summary must never hide", () => {
    const folds = planFolds([
      bash("t1"),
      bash("t2"),
      message("m3", [{ type: "thinking", thinking: "Now let me check." }]),
      bash("t3"),
      bash("t4"),
      bash("t5"),
    ]);

    expect(folds).toEqual([
      {
        rows: [
          { messageId: "t3", blockIndex: 0 },
          { messageId: "t4", blockIndex: 0 },
          { messageId: "t5", blockIndex: 0 },
        ],
        summary: "Ran 3 commands",
      },
    ]);
  });

  it("names what happened, largest group first", () => {
    const summary = summaryOf([
      bash("t1"),
      tool("t2", "Edit"),
      bash("t3"),
      bash("t4"),
      tool("t5", "Edit"),
      bash("t6"),
      bash("t7"),
      bash("t8"),
    ]);

    expect(summary).toBe("Ran 6 commands, edited 2 files");
  });

  it("writes a group of one in the singular", () => {
    const summary = summaryOf([bash("t1"), bash("t2"), tool("t3", "Write")]);

    expect(summary).toBe("Ran 2 commands, wrote 1 file");
  });

  it("elides everything past the two largest groups", () => {
    const summary = summaryOf([
      bash("t1"),
      bash("t2"),
      bash("t3"),
      tool("t4", "Edit"),
      tool("t5", "Edit"),
      tool("t6", "Read"),
      tool("t7", "Write"),
    ]);

    expect(summary).toBe("Ran 3 commands, edited 2 files, +2 more");
  });

  it("falls back to a plain count when nothing fits a known group", () => {
    const summary = summaryOf([
      tool("t1", "WebFetch"),
      tool("t2", "TodoWrite"),
      tool("t3", "WebSearch"),
    ]);

    expect(summary).toBe("Ran 3 tools");
  });
});

describe("planLayout", () => {
  it("anchors a fold at its first unit, and marks the turns it swallows", () => {
    const layouts = planLayout([bash("t1"), bash("t2"), bash("t3")]);

    expect(layouts.map((layout) => layout.segments)).toEqual([
      [
        {
          kind: "run",
          entries: [
            {
              kind: "fold",
              foldId: "fold:t1:0",
              summary: "Ran 3 commands",
              blockIndices: [0],
              isAnchor: true,
            },
          ],
        },
      ],
      [
        {
          kind: "run",
          entries: [
            {
              kind: "fold",
              foldId: "fold:t1:0",
              summary: "Ran 3 commands",
              blockIndices: [0],
              isAnchor: false,
            },
          ],
        },
      ],
      [
        {
          kind: "run",
          entries: [
            {
              kind: "fold",
              foldId: "fold:t1:0",
              summary: "Ran 3 commands",
              blockIndices: [0],
              isAnchor: false,
            },
          ],
        },
      ],
    ]);
  });

  it("leaves an unfolded unit as a plain entry beside a fold", () => {
    const layouts = planLayout([
      message("m1", [
        { type: "thinking", thinking: "Let me look." },
        { type: "tool_use", id: "t1", name: "Read", input: {} },
        { type: "tool_use", id: "t2", name: "Read", input: {} },
        { type: "tool_use", id: "t3", name: "Read", input: {} },
      ]),
    ]);

    expect(layouts[0]!.segments).toEqual([
      {
        kind: "run",
        entries: [
          { kind: "unit", blockIndex: 0 },
          {
            kind: "fold",
            foldId: "fold:m1:1",
            summary: "Read 3 files",
            blockIndices: [1, 2, 3],
            isAnchor: true,
          },
        ],
      },
    ]);
  });
});
