import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import type { PatchHunk } from "@/types";
import { DiffView } from "./DiffView";

const editHunk: PatchHunk = {
  oldStart: 40,
  oldLines: 3,
  newStart: 40,
  newLines: 3,
  lines: ["   return (", "-  <pre>", "+  <DiffView />", "   );"],
};

describe("DiffView", () => {
  it("shows the file path above the diff", () => {
    render(
      <DiffView
        filePath="web/src/conversation/CollapsibleToolCall.tsx"
        patch={[editHunk]}
      />
    );

    expect(
      screen.getByText("web/src/conversation/CollapsibleToolCall.tsx")
    ).not.toBeNull();
  });

  it("marks each line's kind and its real line numbers", () => {
    render(<DiffView filePath="a.tsx" patch={[editHunk]} />);

    const rows = screen.getAllByTestId("diff-line");
    expect(rows.map((r) => r.getAttribute("data-kind"))).toEqual([
      "context",
      "remove",
      "add",
      "context",
    ]);

    // The removed line carries its old number and no new one; the added line the reverse.
    const removed = rows[1];
    expect(within(removed).getByText("41")).not.toBeNull();
    const added = rows[2];
    expect(within(added).getByText("41")).not.toBeNull();
    expect(within(added).getByText("<DiffView />")).not.toBeNull();
  });

  it("renders the whole diff with no reveal control when under the cap", () => {
    render(<DiffView filePath="a.tsx" patch={[editHunk]} lineCap={100} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps both gutters when the diff removes or keeps any line", () => {
    render(<DiffView filePath="a.tsx" patch={[editHunk]} />);

    expect(screen.getAllByTestId("diff-old-gutter").length).toBeGreaterThan(0);
  });

  it("drops the old-side gutter for an all-add diff, so a new file is not a dead column", () => {
    const newFile: PatchHunk = {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 2,
      lines: ["+one", "+two"],
    };

    render(<DiffView filePath="new.tsx" patch={[newFile]} />);

    expect(screen.queryByTestId("diff-old-gutter")).toBeNull();
    // The new-side numbers still show — the file just reads on a single gutter.
    const rows = screen.getAllByTestId("diff-line");
    expect(within(rows[0]).getByText("1")).not.toBeNull();
  });

  it("caps a long diff and reveals the rest on demand", async () => {
    const longHunk: PatchHunk = {
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: 6,
      lines: ["+one", "+two", "+three", "+four", "+five", "+six"],
    };

    render(<DiffView filePath="a.tsx" patch={[longHunk]} lineCap={4} />);

    expect(screen.getAllByTestId("diff-line")).toHaveLength(4);
    expect(screen.queryByText("six")).toBeNull();

    const reveal = screen.getByRole("button");
    expect(reveal.textContent).toContain("2");
    await userEvent.click(reveal);

    expect(screen.getAllByTestId("diff-line")).toHaveLength(6);
    expect(screen.getByText("six")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

const tsHunk: PatchHunk = {
  oldStart: 1,
  oldLines: 0,
  newStart: 1,
  newLines: 1,
  lines: ["+const answer = 42;"],
};

describe("DiffView syntax highlighting", () => {
  it("highlights the code, with the language taken from the file path", async () => {
    const { container } = render(
      <DiffView filePath="answer.ts" patch={[tsHunk]} />
    );

    // The highlighter loads after mount, so the keyword span appears async.
    await waitFor(() =>
      expect(container.querySelector(".hljs-keyword")).not.toBeNull()
    );
    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("const");
  });

  it("renders plain, with no token markup, for an unrecognised language", async () => {
    const { container } = render(
      <DiffView filePath="notes/journal.xyz" patch={[tsHunk]} />
    );

    // Give any stray highlighter load a chance to resolve; it must not — the
    // text stays a single plain node.
    await Promise.resolve();
    expect(container.querySelector("[class^='hljs-']")).toBeNull();
    expect(screen.getByText("const answer = 42;")).not.toBeNull();
  });

  it("stops highlighting past the cap, so the rest renders plain", async () => {
    const twoLines: PatchHunk = {
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: 2,
      lines: ["+const first = 1;", "+const second = 2;"],
    };

    const { container } = render(
      <DiffView filePath="answer.ts" patch={[twoLines]} highlightCap={1} />
    );

    // The first line is highlighted; the second, past the cap, stays plain.
    await waitFor(() =>
      expect(container.querySelectorAll(".hljs-keyword")).toHaveLength(1)
    );
    const rows = screen.getAllByTestId("diff-line");
    expect(within(rows[0]).queryByText("const")).not.toBeNull();
    expect(within(rows[1]).getByText("const second = 2;")).not.toBeNull();
  });

  it("keeps the added/removed ground under the token colours", async () => {
    const changeHunk: PatchHunk = {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: ["-const old = 1;", "+const now = 2;"],
    };

    const { container } = render(
      <DiffView filePath="answer.ts" patch={[changeHunk]} />
    );

    await waitFor(() =>
      expect(
        container.querySelectorAll(".hljs-keyword").length
      ).toBeGreaterThan(0)
    );

    // The tint rides on the row, not the token spans — so it survives with
    // highlighting applied: the diff is still primarily a diff.
    const rows = screen.getAllByTestId("diff-line");
    const removed = rows.find((r) => r.getAttribute("data-kind") === "remove");
    const added = rows.find((r) => r.getAttribute("data-kind") === "add");
    expect(removed?.className).toContain("bg-destructive/10");
    expect(added?.className).toContain("bg-green-500/10");
    // The token colours live inside those same rows.
    expect(removed?.querySelector(".hljs-keyword")).not.toBeNull();
    expect(added?.querySelector(".hljs-keyword")).not.toBeNull();
  });
});
