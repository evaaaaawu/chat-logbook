import { describe, it, expect } from "vitest";
import {
  parseChatCounts,
  parseMessages,
  parsePage,
  parseTagsByChat,
} from "./parse";

const chat = {
  id: "clog_a3f7kx",
  sourceId: "SRC01",
  agent: "claude-code",
  title: "Build a login page",
  project: "my-web-app",
  projectPath: null,
  sourceFilePath: null,
  createdAt: 1700000000000,
  updatedAt: 1700000100000,
  deletedAt: null,
  tags: [{ id: "tag-1", name: "work", color: "red" }],
};

describe("parsePage", () => {
  it("returns the chats and cursor of a well-formed page", () => {
    expect(parsePage({ chats: [chat], nextCursor: "abc" })).toEqual({
      chats: [chat],
      nextCursor: "abc",
    });
  });

  it("reads a missing cursor as the last page", () => {
    expect(parsePage({ chats: [chat] })).toEqual({
      chats: [chat],
      nextCursor: null,
    });
  });

  it("rejects a page holding a chat of the wrong shape", () => {
    expect(
      parsePage({ chats: [{ ...chat, createdAt: "yesterday" }] })
    ).toBeNull();
  });

  it.each(["tags", "deletedAt"])(
    "rejects a chat the server sent without %s",
    (field) => {
      const partial = Object.fromEntries(
        Object.entries(chat).filter(([key]) => key !== field)
      );
      expect(parsePage({ chats: [partial], nextCursor: null })).toBeNull();
    }
  );

  it("rejects a tag whose color is not a palette token", () => {
    const pink = { ...chat, tags: [{ id: "t", name: "n", color: "pink" }] };
    expect(parsePage({ chats: [pink], nextCursor: null })).toBeNull();
  });
});

describe("parseMessages", () => {
  const base = { id: "m-1", role: "assistant", timestamp: "2024-01-01T00:00Z" };

  it("keeps a message and drops only the block it does not recognize", () => {
    const body = {
      messages: [
        {
          ...base,
          content: [
            { type: "text", text: "hi" },
            { type: "hologram", beam: 1 },
          ],
        },
      ],
    };

    expect(parseMessages(body)).toEqual([
      { ...base, content: [{ type: "text", text: "hi" }] },
    ]);
  });

  it("drops a message whose content is not a block list", () => {
    const body = { messages: [{ ...base, content: "hello", model: "m" }] };
    expect(parseMessages(body)).toEqual([]);
  });

  it("drops a message whose role is unknown", () => {
    const body = { messages: [{ ...base, role: "narrator", content: [] }] };
    expect(parseMessages(body)).toEqual([]);
  });

  it("rejects a body without a messages array", () => {
    expect(parseMessages({ error: "Chat not found" })).toBeNull();
  });
});

describe("parseChatCounts", () => {
  it("fills a missing field with its empty value", () => {
    expect(parseChatCounts({ total: 3 })).toEqual({
      total: 3,
      projects: [],
      tags: [],
      untagged: 0,
    });
  });
});

describe("parseTagsByChat", () => {
  it("rejects a chat entry that is not a list of tags", () => {
    expect(parseTagsByChat({ byChat: { clog_a3f7kx: "work" } })).toBeNull();
  });
});
