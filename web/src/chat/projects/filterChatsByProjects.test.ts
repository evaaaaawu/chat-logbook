import { describe, it, expect } from "vitest";
import type { Chat } from "@/types";
import { filterChatsByProjects } from "./filterChatsByProjects";

function chat(id: string, project: string): Chat {
  return {
    id,
    sourceId: id,
    agent: "claude-code",
    title: "Untitled",
    project,
    projectPath: null,
    sourceFilePath: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("filterChatsByProjects", () => {
  const chats = [chat("a", "web"), chat("b", "api"), chat("c", "")];

  it("returns every chat when the selection is empty", () => {
    expect(filterChatsByProjects(chats, new Set()).map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps only chats in the selected project", () => {
    expect(
      filterChatsByProjects(chats, new Set(["web"])).map((c) => c.id)
    ).toEqual(["a"]);
  });

  it("unions chats across several selected projects (OR)", () => {
    expect(
      filterChatsByProjects(chats, new Set(["web", "api"])).map((c) => c.id)
    ).toEqual(["a", "b"]);
  });

  it("selects the (No project) group via the empty-string entry", () => {
    expect(
      filterChatsByProjects(chats, new Set([""])).map((c) => c.id)
    ).toEqual(["c"]);
  });
});
