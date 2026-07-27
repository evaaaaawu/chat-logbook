import { describe, it, expect } from "vitest";
import type { ActionKind, ContentBlock, Message } from "@/types";
import { planFolds, planLayout } from "@/conversation/folds";

function message(id: string, content: ContentBlock[]): Message {
  return { id, role: "assistant", content, timestamp: "2026-07-22T00:00:00Z" };
}

// Names no Claude Code archive would hold, so every test here asserts the
// grouping comes from the Action rather than from the tool that ran (#261).
const FOREIGN_NAMES: Record<ActionKind, string> = {
  edit: "apply_patch",
  write: "write_file",
  read: "read_file",
  search: "ripgrep",
  execute: "shell",
  delegate: "spawn",
  other: "update_plan",
};

function unit(id: string, kind: ActionKind): Message {
  return message(id, [toolBlock(id, kind)]);
}

function toolBlock(id: string, kind: ActionKind): ContentBlock {
  return {
    type: "tool_use",
    id,
    name: FOREIGN_NAMES[kind],
    input: {},
    action: { kind },
  };
}

function bash(id: string): Message {
  return unit(id, "execute");
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

  it("groups by what each call did, not by the tool that ran it", () => {
    const summary = summaryOf([
      unit("t1", "execute"),
      unit("t2", "execute"),
      unit("t3", "execute"),
    ]);

    expect(summary).toBe("Ran 3 commands");
  });

  it("names what happened, largest group first", () => {
    const summary = summaryOf([
      bash("t1"),
      unit("t2", "edit"),
      bash("t3"),
      bash("t4"),
      unit("t5", "edit"),
      bash("t6"),
      bash("t7"),
      bash("t8"),
    ]);

    expect(summary).toBe("Ran 6 commands, edited 2 files");
  });

  // The rows this hides say `Read` and `Searched for` apart, because a search's
  // object is a pattern and `Read "useMessages"` does not parse. One line above
  // them, both are the Agent looking things up, and splitting the count would
  // only make the summary harder to skim (#199).
  it("counts reading and searching as one group", () => {
    const summary = summaryOf([
      unit("t1", "read"),
      unit("t2", "search"),
      unit("t3", "read"),
    ]);

    expect(summary).toBe("Read 3 files");
  });

  it("writes a group of one in the singular", () => {
    const summary = summaryOf([bash("t1"), bash("t2"), unit("t3", "write")]);

    expect(summary).toBe("Ran 2 commands, wrote 1 file");
  });

  it("elides everything past the two largest groups", () => {
    const summary = summaryOf([
      bash("t1"),
      bash("t2"),
      bash("t3"),
      unit("t4", "edit"),
      unit("t5", "edit"),
      unit("t6", "read"),
      unit("t7", "write"),
    ]);

    expect(summary).toBe("Ran 3 commands, edited 2 files, +2 more");
  });

  it("names delegation as its own group", () => {
    const summary = summaryOf([
      unit("t1", "delegate"),
      unit("t2", "delegate"),
      unit("t3", "delegate"),
    ]);

    expect(summary).toBe("Delegated 3 tasks");
  });

  it("counts a call that fits no group rather than hiding it", () => {
    const summary = summaryOf([
      bash("t1"),
      unit("t2", "other"),
      bash("t3"),
      unit("t4", "other"),
      bash("t5"),
    ]);

    expect(summary).toBe("Ran 3 commands, +2 more");
  });

  // A unit normalized before Actions existed, still in flight until
  // re-normalize catches up. It reads as `Used` on its row, and here it counts
  // toward the total the same way `other` does (#260).
  it("counts a unit that has no Action yet", () => {
    const summary = summaryOf([
      bash("t1"),
      bash("t2"),
      message("t3", [{ type: "tool_use", id: "t3", name: "Bash", input: {} }]),
    ]);

    expect(summary).toBe("Ran 2 commands, +1 more");
  });

  it("falls back to a plain count when nothing fits a known group", () => {
    const summary = summaryOf([
      unit("t1", "other"),
      unit("t2", "other"),
      unit("t3", "other"),
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
        toolBlock("t1", "read"),
        toolBlock("t2", "read"),
        toolBlock("t3", "read"),
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
