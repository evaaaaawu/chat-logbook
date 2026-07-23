import { render, screen } from "@testing-library/react";
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
});
