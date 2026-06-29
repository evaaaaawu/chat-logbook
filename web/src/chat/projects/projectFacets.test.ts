import { describe, it, expect } from "vitest";
import { facetsFromCounts } from "./projectFacets";

describe("facetsFromCounts", () => {
  it("carries the per-project count straight from the server aggregation", () => {
    const facets = facetsFromCounts([
      { project: "web", count: 2, lastActiveAt: 3 },
      { project: "api", count: 1, lastActiveAt: 1 },
    ]);
    const byProject = new Map(facets.map((f) => [f.project, f.count]));
    expect(byProject.get("web")).toBe(2);
    expect(byProject.get("api")).toBe(1);
  });

  it("orders projects by recency, most-recently-active first", () => {
    const facets = facetsFromCounts([
      { project: "old", count: 1, lastActiveAt: 10 },
      { project: "new", count: 1, lastActiveAt: 100 },
      { project: "mid", count: 1, lastActiveAt: 50 },
    ]);
    expect(facets.map((f) => f.project)).toEqual(["new", "mid", "old"]);
  });

  it("pins the (No project) group last regardless of recency", () => {
    const facets = facetsFromCounts([
      { project: "", count: 1, lastActiveAt: 1000 },
      { project: "web", count: 1, lastActiveAt: 5 },
    ]);
    expect(facets[facets.length - 1].project).toBe("");
  });

  it("labels the empty-project group as (No project) and others by name", () => {
    const facets = facetsFromCounts([
      { project: "web", count: 1, lastActiveAt: 2 },
      { project: "", count: 1, lastActiveAt: 1 },
    ]);
    expect(facets.find((f) => f.project === "web")?.label).toBe("web");
    expect(facets.find((f) => f.project === "")?.label).toBe("(No project)");
  });

  it("keeps an ensured project visible at count 0 when the view holds none", () => {
    const facets = facetsFromCounts(
      [{ project: "web", count: 1, lastActiveAt: 2 }],
      { ensure: ["api"] }
    );
    const api = facets.find((f) => f.project === "api");
    expect(api).toBeDefined();
    expect(api?.count).toBe(0);
  });

  it("does not duplicate an ensured project that still has chats", () => {
    const facets = facetsFromCounts(
      [{ project: "web", count: 3, lastActiveAt: 2 }],
      { ensure: ["web"] }
    );
    expect(facets.filter((f) => f.project === "web")).toHaveLength(1);
    expect(facets.find((f) => f.project === "web")?.count).toBe(3);
  });
});
