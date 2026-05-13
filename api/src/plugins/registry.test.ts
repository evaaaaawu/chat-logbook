import { describe, it, expect } from "vitest";
import { plugins } from "./registry.js";

describe("plugins registry", () => {
  it("exports the Claude Code plugin", () => {
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("claude-code");
    expect(plugins[0].displayName).toBe("Claude Code");
  });
});
