import { describe, it, expect } from "vitest";
import { generateToolSummary } from "./generateToolSummary";

describe("generateToolSummary", () => {
  it("summarizes Read tool with file path", () => {
    expect(
      generateToolSummary({
        type: "tool_use",
        id: "t1",
        name: "Read",
        input: { file_path: "src/index.ts" },
      })
    ).toBe("Read: src/index.ts");
  });

  it("summarizes Bash tool with command", () => {
    expect(
      generateToolSummary({
        type: "tool_use",
        id: "t2",
        name: "Bash",
        input: { command: "npm test" },
      })
    ).toBe("Bash: npm test");
  });

  it("truncates long Bash commands", () => {
    const longCommand = "a".repeat(120);
    const result = generateToolSummary({
      type: "tool_use",
      id: "t3",
      name: "Bash",
      input: { command: longCommand },
    });
    expect(result.length).toBeLessThanOrEqual(
      100 + "Bash: ".length + "…".length
    );
    expect(result).toMatch(/^Bash: a+…$/);
  });

  it("summarizes Edit tool with file path", () => {
    expect(
      generateToolSummary({
        type: "tool_use",
        id: "t4",
        name: "Edit",
        input: {
          file_path: "src/app.ts",
          old_string: "foo",
          new_string: "bar",
        },
      })
    ).toBe("Edit: src/app.ts");
  });

  it("summarizes Write tool with file path", () => {
    expect(
      generateToolSummary({
        type: "tool_use",
        id: "t5",
        name: "Write",
        input: { file_path: "README.md", content: "hello" },
      })
    ).toBe("Write: README.md");
  });

  it("summarizes Glob tool with pattern", () => {
    expect(
      generateToolSummary({
        type: "tool_use",
        id: "t6",
        name: "Glob",
        input: { pattern: "**/*.ts" },
      })
    ).toBe("Glob: **/*.ts");
  });

  it("summarizes Grep tool with pattern", () => {
    expect(
      generateToolSummary({
        type: "tool_use",
        id: "t7",
        name: "Grep",
        input: { pattern: "TODO" },
      })
    ).toBe("Grep: TODO");
  });

  it("falls back to tool name for unknown tools", () => {
    expect(
      generateToolSummary({
        type: "tool_use",
        id: "t8",
        name: "CustomTool",
        input: { foo: "bar" },
      })
    ).toBe("CustomTool");
  });
});
