import { describe, expect, it } from "vitest";
import { helpText } from "./help.js";

describe("helpText", () => {
  it("describes the default invocation (start server, open UI)", () => {
    expect(helpText).toMatch(/chat-log\b/);
    expect(helpText.toLowerCase()).toMatch(/start|open|server|ui/);
  });

  it("documents --version / -v", () => {
    expect(helpText).toContain("--version");
    expect(helpText).toContain("-v");
  });

  it("documents --help / -h", () => {
    expect(helpText).toContain("--help");
    expect(helpText).toContain("-h");
  });

  it("documents PORT env var", () => {
    expect(helpText).toMatch(/PORT=/);
  });

  it("documents --port / -p flag", () => {
    expect(helpText).toContain("--port");
    expect(helpText).toContain("-p");
  });

  it("fits within 80 columns", () => {
    for (const line of helpText.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});
