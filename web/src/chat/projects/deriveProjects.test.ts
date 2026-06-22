import { describe, it, expect } from "vitest";
import type { Chat } from "@/types";
import { deriveProjects } from "./deriveProjects";

function chat(partial: Partial<Chat> & { id: string }): Chat {
  return {
    sourceId: partial.id,
    agent: "claude-code",
    title: partial.title ?? "Untitled",
    project: partial.project ?? "",
    projectPath: partial.projectPath ?? null,
    sourceFilePath: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("deriveProjects", () => {
  it("groups chats by project with per-project counts", () => {
    const facets = deriveProjects([
      chat({ id: "a", project: "web", updatedAt: 3 }),
      chat({ id: "b", project: "web", updatedAt: 2 }),
      chat({ id: "c", project: "api", updatedAt: 1 }),
    ]);
    const byProject = new Map(facets.map((f) => [f.project, f.count]));
    expect(byProject.get("web")).toBe(2);
    expect(byProject.get("api")).toBe(1);
  });

  it("orders projects by recency, most-recently-active first", () => {
    const facets = deriveProjects([
      chat({ id: "a", project: "old", updatedAt: 10 }),
      chat({ id: "b", project: "new", updatedAt: 100 }),
      chat({ id: "c", project: "mid", updatedAt: 50 }),
    ]);
    expect(facets.map((f) => f.project)).toEqual(["new", "mid", "old"]);
  });

  it("pins the (No project) group last regardless of recency", () => {
    const facets = deriveProjects([
      chat({ id: "a", project: "", updatedAt: 1000 }),
      chat({ id: "b", project: "web", updatedAt: 5 }),
    ]);
    expect(facets[facets.length - 1].project).toBe("");
  });

  it("labels the empty-project group as (No project) and others by name", () => {
    const facets = deriveProjects([
      chat({ id: "a", project: "web", updatedAt: 2 }),
      chat({ id: "b", project: "", updatedAt: 1 }),
    ]);
    const web = facets.find((f) => f.project === "web");
    const none = facets.find((f) => f.project === "");
    expect(web?.label).toBe("web");
    expect(none?.label).toBe("(No project)");
  });

  it("keeps an ensured project visible at count 0 when no chats remain in it", () => {
    const facets = deriveProjects(
      [chat({ id: "a", project: "web", updatedAt: 2 })],
      { ensure: ["api"] }
    );
    const api = facets.find((f) => f.project === "api");
    expect(api).toBeDefined();
    expect(api?.count).toBe(0);
  });

  it("does not duplicate an ensured project that still has chats", () => {
    const facets = deriveProjects(
      [chat({ id: "a", project: "web", updatedAt: 2 })],
      { ensure: ["web"] }
    );
    expect(facets.filter((f) => f.project === "web")).toHaveLength(1);
    expect(facets.find((f) => f.project === "web")?.count).toBe(1);
  });
});
