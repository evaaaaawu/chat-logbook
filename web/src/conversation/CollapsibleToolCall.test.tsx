import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ContentBlock } from "@/types";
import type { ToolResultBlock } from "@/conversation/toolUnits";
import { CollapsibleToolCall } from "./CollapsibleToolCall";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

const editCall: ToolUseBlock = {
  type: "tool_use",
  id: "t1",
  name: "Edit",
  input: { file_path: "a.tsx", old_string: "x", new_string: "y" },
};

describe("CollapsibleToolCall", () => {
  it("renders an expanded edit result as a diff, not raw JSON", () => {
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t1",
      content: "The file a.tsx has been updated.",
      file_path: "src/a.tsx",
      patch: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: ["-old", "+new"],
        },
      ],
    };

    render(
      <CollapsibleToolCall
        block={editCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    // The diff renders its rows and the applied path...
    expect(screen.getAllByTestId("diff-line")).toHaveLength(2);
    expect(screen.getByText("src/a.tsx")).not.toBeNull();
    // ...and the raw result prose is not dumped as a <pre>.
    expect(screen.queryByText("The file a.tsx has been updated.")).toBeNull();
  });

  it("gives an edit's counts the row's trailing edge, not its label", () => {
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t1",
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
    };

    render(
      <CollapsibleToolCall
        block={editCall}
        result={result}
        isExpanded={false}
        onToggle={() => {}}
      />
    );

    expect(screen.getByTestId("row-diff-stat").textContent).toBe("+3 -1");
    expect(screen.getByText("Edited CollapsibleToolCall.tsx")).not.toBeNull();
  });

  it("falls back to the raw rendering when the result carries no patch", () => {
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t1",
      content: "The file a.tsx has been updated.",
    };

    render(
      <CollapsibleToolCall
        block={editCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.queryByTestId("diff-line")).toBeNull();
    expect(screen.getByText("The file a.tsx has been updated.")).not.toBeNull();
  });

  it("renders an expanded read as a numbered file excerpt, not raw output", () => {
    const readCall: ToolUseBlock = {
      type: "tool_use",
      id: "t2",
      name: "Read",
      input: { file_path: "src/answer.ts" },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t2",
      content: "40\tconst answer = 42;\n41\treturn answer;",
    };

    render(
      <CollapsibleToolCall
        block={readCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    const rows = screen.getAllByTestId("excerpt-line");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("src/answer.ts")).not.toBeNull();
    // The numbers are lifted into the gutter, so the raw `40\t…` never shows.
    expect(screen.getByText("const answer = 42;")).not.toBeNull();
    expect(screen.queryByText(/40\tconst answer = 42;/)).toBeNull();
  });

  it("falls back to the raw rendering for a read whose result is not text", () => {
    const readCall: ToolUseBlock = {
      type: "tool_use",
      id: "t3",
      name: "Read",
      input: { file_path: "shot.png" },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t3",
      content: [{ type: "image", source: "…" }],
    };

    render(
      <CollapsibleToolCall
        block={readCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.queryByTestId("excerpt-line")).toBeNull();
  });

  it("colours the input of a unit that renders neither diff nor excerpt", async () => {
    const searchCall: ToolUseBlock = {
      type: "tool_use",
      id: "t4",
      name: "Grep",
      input: { pattern: "useState" },
    };

    const { container } = render(
      <CollapsibleToolCall block={searchCall} isExpanded onToggle={() => {}} />
    );

    await waitFor(() =>
      expect(container.querySelector(".hljs-attr")).not.toBeNull()
    );
    expect(container.querySelector(".hljs-attr")?.textContent).toBe(
      '"pattern"'
    );
  });
});
