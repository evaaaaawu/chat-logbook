import { afterEach, describe, it, expect } from "vitest";
import { loadTagMode, saveTagMode } from "./tagModePreference";

const KEY = "chat-logbook:tag-mode:main";

afterEach(() => {
  localStorage.clear();
});

describe("tagModePreference", () => {
  it("defaults to 'all' when nothing is stored", () => {
    expect(loadTagMode(KEY)).toBe("all");
  });

  it("round-trips a saved mode (restored on reload)", () => {
    saveTagMode(KEY, "any");
    expect(loadTagMode(KEY)).toBe("any");
  });

  it("keeps a separate mode per view key", () => {
    saveTagMode("chat-logbook:tag-mode:main", "any");
    saveTagMode("chat-logbook:tag-mode:trash", "all");
    expect(loadTagMode("chat-logbook:tag-mode:main")).toBe("any");
    expect(loadTagMode("chat-logbook:tag-mode:trash")).toBe("all");
  });

  it("falls back to 'all' on a malformed stored value", () => {
    localStorage.setItem(KEY, "not json");
    expect(loadTagMode(KEY)).toBe("all");
  });
});
