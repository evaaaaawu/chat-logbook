import { describe, it, expect } from "vitest";
import type { Chat, Tag } from "@/types";
import { filterChatsByTags, UNTAGGED } from "./filterChatsByTags";

const bug: Tag = { id: "t-bug", name: "bug", color: "red" };
const idea: Tag = { id: "t-idea", name: "idea", color: "violet" };

function chat(id: string, tags: Tag[]): Chat {
  return {
    id,
    sourceId: id,
    agent: "claude-code",
    title: "Untitled",
    project: "",
    projectPath: null,
    sourceFilePath: null,
    createdAt: 0,
    updatedAt: 0,
    tags,
  };
}

describe("filterChatsByTags", () => {
  const chats = [
    chat("both", [bug, idea]),
    chat("bug-only", [bug]),
    chat("bare", []),
  ];

  it("returns every chat when the selection is empty", () => {
    expect(filterChatsByTags(chats, new Set()).map((c) => c.id)).toEqual([
      "both",
      "bug-only",
      "bare",
    ]);
  });

  it("keeps only chats holding ALL selected tags (AND)", () => {
    expect(
      filterChatsByTags(chats, new Set([bug.id, idea.id])).map((c) => c.id)
    ).toEqual(["both"]);
  });

  it("selects chats with zero tags via the UNTAGGED entry", () => {
    expect(
      filterChatsByTags(chats, new Set([UNTAGGED])).map((c) => c.id)
    ).toEqual(["bare"]);
  });

  it("yields nothing when UNTAGGED is combined with a real tag", () => {
    expect(filterChatsByTags(chats, new Set([UNTAGGED, bug.id]))).toEqual([]);
  });

  it("treats a missing tags array as untagged", () => {
    const noTagsField = { ...chat("legacy", []) };
    delete (noTagsField as { tags?: Tag[] }).tags;
    expect(
      filterChatsByTags([noTagsField], new Set([UNTAGGED])).map((c) => c.id)
    ).toEqual(["legacy"]);
  });
});
