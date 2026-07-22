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

  it("summarizes an Edit that carries a patch as a diff line", () => {
    expect(
      generateToolSummary(
        {
          type: "tool_use",
          id: "t4",
          name: "Edit",
          input: { file_path: "web/src/conversation/CollapsibleToolCall.tsx" },
        },
        {
          type: "tool_result",
          tool_use_id: "t4",
          content: "updated",
          file_path: "web/src/conversation/CollapsibleToolCall.tsx",
          patch: [
            {
              oldStart: 3,
              oldLines: 4,
              newStart: 3,
              newLines: 6,
              lines: [" keep", "-gone", "+one", "+two", "+three"],
            },
          ],
        }
      )
    ).toBe("Edited CollapsibleToolCall.tsx +3 -1");
  });

  it("summarizes a Write as written, counting a whole new file as added", () => {
    expect(
      generateToolSummary(
        {
          type: "tool_use",
          id: "t5",
          name: "Write",
          input: { file_path: "/repo/docs/README.md", content: "a\nb\n" },
        },
        {
          type: "tool_result",
          tool_use_id: "t5",
          content: "created",
          file_path: "/repo/docs/README.md",
          patch: [
            {
              oldStart: 1,
              oldLines: 0,
              newStart: 1,
              newLines: 2,
              lines: ["+a", "+b"],
            },
          ],
        }
      )
    ).toBe("Wrote README.md +2 -0");
  });

  it("sums a MultiEdit's hunks into one pair of counts", () => {
    expect(
      generateToolSummary(
        {
          type: "tool_use",
          id: "t6",
          name: "MultiEdit",
          input: { file_path: "/repo/src/app.ts" },
        },
        {
          type: "tool_result",
          tool_use_id: "t6",
          content: "updated",
          file_path: "/repo/src/app.ts",
          patch: [
            {
              oldStart: 1,
              oldLines: 2,
              newStart: 1,
              newLines: 2,
              lines: ["-a", "+b"],
            },
            {
              oldStart: 40,
              oldLines: 3,
              newStart: 40,
              newLines: 4,
              lines: [" keep", "-c", "+d", "+e"],
            },
          ],
        }
      )
    ).toBe("Edited app.ts +3 -2");
  });

  it("keeps the plain summary for an edit whose result carries no patch", () => {
    expect(
      generateToolSummary(
        {
          type: "tool_use",
          id: "t7",
          name: "Edit",
          input: { file_path: "src/app.ts" },
        },
        { type: "tool_result", tool_use_id: "t7", content: "updated" }
      )
    ).toBe("Edit: src/app.ts");
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
