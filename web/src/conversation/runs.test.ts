import { describe, it, expect } from "vitest";
import type { Message } from "@/types";
import { groupRuns } from "@/conversation/runs";

function message(id: string, content: Message["content"]): Message {
  return { id, role: "assistant", content, timestamp: "2026-07-22T00:00:00Z" };
}

function toolUse(id: string): Message["content"] {
  return [{ type: "tool_use", id, name: "Bash", input: {} }];
}

describe("groupRuns", () => {
  it("groups consecutive tool units into one Run, and ends it at message text", () => {
    const runs = groupRuns([
      message("m1", toolUse("t1")),
      message("m2", toolUse("t2")),
      message("m3", [{ type: "text", text: "Done." }]),
      message("m4", toolUse("t3")),
    ]);

    expect(runs).toEqual([
      {
        rows: [
          { messageId: "m1", blockIndex: 0 },
          { messageId: "m2", blockIndex: 0 },
        ],
      },
      { rows: [{ messageId: "m4", blockIndex: 0 }] },
    ]);
  });

  it("keeps thinking inside the Run, across message boundaries", () => {
    const runs = groupRuns([
      message("m1", [
        { type: "thinking", thinking: "Let me look." },
        { type: "tool_use", id: "t1", name: "Read", input: {} },
      ]),
      message("m2", toolUse("t2")),
      message("m3", [{ type: "thinking", thinking: "Now edit." }]),
    ]);

    expect(runs).toEqual([
      {
        rows: [
          { messageId: "m1", blockIndex: 0 },
          { messageId: "m1", blockIndex: 1 },
          { messageId: "m2", blockIndex: 0 },
          { messageId: "m3", blockIndex: 0 },
        ],
      },
    ]);
  });

  it("splits a Run where text sits between blocks of one message", () => {
    const runs = groupRuns([
      message("m1", [
        { type: "tool_use", id: "t1", name: "Bash", input: {} },
        { type: "text", text: "Here's what I found." },
        { type: "thinking", thinking: "Next." },
      ]),
    ]);

    expect(runs).toEqual([
      { rows: [{ messageId: "m1", blockIndex: 0 }] },
      { rows: [{ messageId: "m1", blockIndex: 2 }] },
    ]);
  });

  it("does not split a Run at a tool result, which renders nothing of its own", () => {
    const runs = groupRuns([
      message("m1", [
        { type: "tool_use", id: "t1", name: "Bash", input: {} },
        { type: "tool_result", tool_use_id: "t1", content: "ok" },
        { type: "tool_use", id: "t2", name: "Bash", input: {} },
      ]),
    ]);

    expect(runs).toEqual([
      {
        rows: [
          { messageId: "m1", blockIndex: 0 },
          { messageId: "m1", blockIndex: 2 },
        ],
      },
    ]);
  });
});
