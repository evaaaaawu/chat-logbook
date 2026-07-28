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
  action: { kind: "edit", object: { type: "path", value: "src/a.tsx" } },
};

/** What the row reads as, with the label's own slots joined back up. */
function labelOf(element: HTMLElement): string {
  return (element.textContent ?? "").replace(/\s+/g, " ");
}

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
    expect(labelOf(screen.getByTestId("row-label"))).toBe("Edited src/a.tsx");
  });

  // One register across the whole column: a row says what happened, never which
  // tool ran or what its JSON held (#260).
  it.each([
    [
      { kind: "execute", object: { type: "phrase", value: "Run the suite" } },
      'Ran "Run the suite"',
    ],
    [
      { kind: "search", object: { type: "phrase", value: "useMessages" } },
      'Searched for "useMessages"',
    ],
    [
      { kind: "other", object: { type: "phrase", value: "Claude Browser" } },
      'Used "Claude Browser"',
    ],
    [{ kind: "other" }, "Used"],
  ] as const)("reads as a sentence, never as a tool name", (action, label) => {
    render(
      <CollapsibleToolCall
        block={{ ...editCall, name: "mcp__Claude_Browser__computer", action }}
        isExpanded={false}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText(label)).not.toBeNull();
    // A phrase has no directory to give up, so it stays one slot and truncates
    // from the end as before (#262).
    expect(screen.queryByTestId("row-label-name")).toBeNull();
  });

  // Two rows reading `Edited types.ts` hide whether that was one file twice or
  // two files once, so the row names the directory too (#262).
  it("names the directory a path sits in, not the filename alone", () => {
    render(
      <CollapsibleToolCall
        block={{
          ...editCall,
          action: {
            kind: "edit",
            object: {
              type: "path",
              value: "web/src/conversation/CollapsibleToolCall.tsx",
            },
          },
        }}
        isExpanded={false}
        onToggle={() => {}}
      />
    );

    expect(labelOf(screen.getByTestId("row-label"))).toBe(
      "Edited web/src/conversation/CollapsibleToolCall.tsx"
    );
  });

  // The filename is the part that identifies a path, so it gets a slot of its
  // own — the directory beside it is what a narrow row gives away (#262).
  it("keeps the filename in a slot the directory cannot squeeze", () => {
    render(
      <CollapsibleToolCall
        block={{
          ...editCall,
          action: {
            kind: "edit",
            object: {
              type: "path",
              value: "web/src/conversation/CollapsibleToolCall.tsx",
            },
          },
        }}
        isExpanded={false}
        onToggle={() => {}}
      />
    );

    expect(screen.getByTestId("row-label-dir").textContent).toBe(
      "web/src/conversation"
    );
    // The separator travels with the name, so what is left after a squeeze
    // still reads as a path rather than as a bare word.
    expect(screen.getByTestId("row-label-name").textContent).toBe(
      "/CollapsibleToolCall.tsx"
    );
  });

  // Nothing to give up means nothing to split: the label stays one slot.
  it("leaves a path with no directory as one whole label", () => {
    render(
      <CollapsibleToolCall
        block={{
          ...editCall,
          action: {
            kind: "read",
            object: { type: "path", value: "README.md" },
          },
        }}
        isExpanded={false}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText("Read README.md")).not.toBeNull();
    expect(screen.queryByTestId("row-label-dir")).toBeNull();
    expect(screen.queryByTestId("row-label-name")).toBeNull();
  });

  // A row normalized before the command rode along has a label but nothing to
  // expand onto, so it reads as it always did until re-normalize catches up.
  it("falls back to the raw rendering for an execute that carries no command", () => {
    const oldCall: ToolUseBlock = {
      type: "tool_use",
      id: "t11",
      name: "Bash",
      input: { command: "pnpm test" },
      action: {
        kind: "execute",
        object: { type: "phrase", value: "Run the suite" },
      },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t11",
      content: "1 passed",
    };

    render(
      <CollapsibleToolCall
        block={oldCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.queryByTestId("command-line")).toBeNull();
    expect(screen.getByTestId("json-input")).not.toBeNull();
    expect(screen.getByText("1 passed")).not.toBeNull();
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
      action: {
        kind: "read",
        object: { type: "path", value: "src/answer.ts" },
      },
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

  // Same signal, another Agent: a read that names a path expands onto that
  // file, whether the tool was called `Read` or anything else (#263).
  it("expands any read of a path onto the file, whatever the Agent calls the tool", () => {
    const readCall: ToolUseBlock = {
      type: "tool_use",
      id: "t9",
      name: "read_file",
      input: { path: "src/answer.ts" },
      action: {
        kind: "read",
        object: { type: "path", value: "src/answer.ts" },
      },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t9",
      content: "40\tconst answer = 42;",
    };

    render(
      <CollapsibleToolCall
        block={readCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.getAllByTestId("excerpt-line")).toHaveLength(1);
    expect(screen.getByText("src/answer.ts")).not.toBeNull();
  });

  // A fetch is a read too, but what it names is a URL rather than a file, so
  // there is no file to number lines against (#263).
  it("keeps the raw rendering for a read that named no file", () => {
    const fetchCall: ToolUseBlock = {
      type: "tool_use",
      id: "t10",
      name: "WebFetch",
      input: { url: "https://example.com/docs" },
      action: {
        kind: "read",
        object: { type: "phrase", value: "https://example.com/docs" },
      },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t10",
      content: "The page said something.",
    };

    render(
      <CollapsibleToolCall
        block={fetchCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.queryByTestId("excerpt-line")).toBeNull();
    expect(screen.getByText("The page said something.")).not.toBeNull();
  });

  it("falls back to the raw rendering for a read whose result is not text", () => {
    const readCall: ToolUseBlock = {
      type: "tool_use",
      id: "t3",
      name: "Read",
      input: { file_path: "shot.png" },
      action: { kind: "read", object: { type: "path", value: "shot.png" } },
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

  // The Action decides the renderer, so an Agent that names its shell tool
  // something else gets the same expansion from the same signal (#263).
  it("expands any execute onto its command, whatever the Agent calls the tool", async () => {
    const shellCall: ToolUseBlock = {
      type: "tool_use",
      id: "t4",
      name: "shell",
      input: { cmd: ["pnpm", "test"] },
      action: {
        kind: "execute",
        object: { type: "phrase", value: "Run the suite" },
        detail: "pnpm test",
      },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t4",
      content: "1 passed",
    };

    render(
      <CollapsibleToolCall
        block={shellCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.getByTestId("command-line").textContent).toBe("pnpm test");
    expect(screen.getByTestId("command-output").textContent).toContain(
      "1 passed"
    );
    expect(screen.queryByTestId("json-input")).toBeNull();
  });

  it("renders an expanded Bash unit's command as shell, not raw JSON", async () => {
    const bashCall: ToolUseBlock = {
      type: "tool_use",
      id: "t5",
      name: "Bash",
      input: { command: 'echo "hi"', description: "Say hi" },
      action: {
        kind: "execute",
        object: { type: "phrase", value: "Say hi" },
        detail: 'echo "hi"',
      },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t5",
      content: "hi",
    };

    const { container } = render(
      <CollapsibleToolCall
        block={bashCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    // The command stands on its own, with the call's input no longer repeated
    // as JSON above it.
    expect(screen.queryByTestId("json-input")).toBeNull();
    expect(screen.getByTestId("command-line").textContent).toBe('echo "hi"');

    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="command-line"] .hljs-string')
      ).not.toBeNull()
    );
  });

  it("renders a Bash unit's output beneath the command, with no language guessed", async () => {
    const bashCall: ToolUseBlock = {
      type: "tool_use",
      id: "t6",
      name: "Bash",
      input: { command: 'echo "hi"' },
      action: { kind: "execute", detail: 'echo "hi"' },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t6",
      // Reads like shell, but it is only what the command printed.
      content: 'export FOO="hi"',
    };

    const { container } = render(
      <CollapsibleToolCall
        block={bashCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    const commandBlock = screen.getByTestId("command");
    const output = screen.getByTestId("command-output");
    expect(output.textContent).toContain('export FOO="hi"');
    expect(
      commandBlock.compareDocumentPosition(output) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Once the highlighter has landed for the command, the output beside it is
    // still untouched — nothing was guessed for it.
    await waitFor(() =>
      expect(commandBlock.querySelector('[class*="hljs-"]')).not.toBeNull()
    );
    expect(output.querySelector('[class*="hljs-"]')).toBeNull();
    expect(container.querySelector("[data-testid='json-input']")).toBeNull();
  });

  it("renders a Bash unit that printed nothing as the command alone", () => {
    const bashCall: ToolUseBlock = {
      type: "tool_use",
      id: "t7",
      name: "Bash",
      input: { command: "git add ." },
      action: { kind: "execute", detail: "git add ." },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t7",
      content: "",
    };

    render(
      <CollapsibleToolCall
        block={bashCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.getByTestId("command-line").textContent).toBe("git add .");
    expect(screen.queryByTestId("command-output")).toBeNull();
  });

  it("still reads as failed for a Bash unit that reported an error", () => {
    const bashCall: ToolUseBlock = {
      type: "tool_use",
      id: "t8",
      name: "Bash",
      input: { command: "pnpm test" },
      action: { kind: "execute", detail: "pnpm test" },
    };
    const result: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "t8",
      content: "1 test failed",
      is_error: true,
    };

    render(
      <CollapsibleToolCall
        block={bashCall}
        result={result}
        isExpanded
        onToggle={() => {}}
      />
    );

    expect(screen.getByTestId("row-error")).not.toBeNull();
    // What it said back is what explains the failure, so it still renders.
    expect(screen.getByTestId("command-output").textContent).toContain(
      "1 test failed"
    );
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
