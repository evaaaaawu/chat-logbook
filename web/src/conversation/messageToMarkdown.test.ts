import { describe, expect, it } from "vitest";
import type { ContentBlock, Message } from "@/types";
import { messageToMarkdown } from "@/conversation/messageToMarkdown";

function message(content: string | ContentBlock[]): Message {
  return { id: "m1", role: "assistant", content, timestamp: "2026-07-21" };
}

describe("messageToMarkdown", () => {
  it("returns the text of a message whose content is a plain string", () => {
    expect(messageToMarkdown(message("hello **there**"))).toBe(
      "hello **there**"
    );
  });

  it("joins several text blocks with a blank line", () => {
    // A blank line is markdown's paragraph break, so pasted text keeps the
    // separation the reader saw on screen rather than running together.
    const md = messageToMarkdown(
      message([
        { type: "text", text: "first para" },
        { type: "text", text: "second para" },
      ])
    );

    expect(md).toBe("first para\n\nsecond para");
  });

  it("drops the blocks that are not the message's content", () => {
    // Reasoning, tool traffic, harness noise and image metadata are collapsed
    // or lazily addressed on screen precisely because they are not what the
    // reader came to take away.
    const md = messageToMarkdown(
      message([
        { type: "thinking", thinking: "let me consider" },
        { type: "text", text: "the answer" },
        { type: "tool_use", id: "t1", name: "Read", input: {} },
        { type: "tool_result", tool_use_id: "t1", content: "file body" },
        {
          type: "system",
          kind: "task-notification",
          summary: "s",
          detail: "d",
        },
        { type: "image", mediaType: "image/png", ref: "r1" },
      ])
    );

    expect(md).toBe("the answer");
  });

  it("writes a command invocation back as the reader typed it", () => {
    // A slash command renders as a chip, but it is something a person typed —
    // content, not noise — so it comes back in its written form.
    const md = messageToMarkdown(
      message([
        { type: "command", name: "/tdd", args: "issue 198" },
        { type: "text", text: "go" },
      ])
    );

    expect(md).toBe("/tdd issue 198\n\ngo");
  });

  it("leaves no trailing space on a command with no arguments", () => {
    const md = messageToMarkdown(
      message([{ type: "command", name: "/clear", args: "" }])
    );

    expect(md).toBe("/clear");
  });
});
