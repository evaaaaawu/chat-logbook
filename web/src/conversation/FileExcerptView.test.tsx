import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { FileExcerptView } from "./FileExcerptView";

const TS_CONTENT = ["40\tconst answer = 42;", "41\treturn answer;"].join("\n");

describe("FileExcerptView", () => {
  it("shows the file path above the excerpt, with each line's real number", () => {
    render(<FileExcerptView filePath="src/answer.ts" content={TS_CONTENT} />);

    expect(screen.getByText("src/answer.ts")).not.toBeNull();

    const rows = screen.getAllByTestId("excerpt-line");
    expect(within(rows[0]).getByText("40")).not.toBeNull();
    expect(within(rows[1]).getByText("41")).not.toBeNull();
    expect(within(rows[1]).getByText("return answer;")).not.toBeNull();
  });

  it("highlights the code, with the language taken from the file path", async () => {
    const { container } = render(
      <FileExcerptView filePath="src/answer.ts" content={TS_CONTENT} />
    );

    await waitFor(() =>
      expect(container.querySelector(".hljs-keyword")).not.toBeNull()
    );
    // The number stays in the gutter, uncoloured — only the code is tokenised.
    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("const");
  });

  it("renders plain, with no token markup, for an unrecognised language", async () => {
    const { container } = render(
      <FileExcerptView filePath="notes/journal.xyz" content={TS_CONTENT} />
    );

    await Promise.resolve();
    expect(container.querySelector("[class^='hljs-']")).toBeNull();
    expect(screen.getByText("const answer = 42;")).not.toBeNull();
  });

  it("stops highlighting past the cap, so the rest renders plain", async () => {
    const { container } = render(
      <FileExcerptView
        filePath="src/answer.ts"
        content={TS_CONTENT}
        highlightCap={1}
      />
    );

    await waitFor(() =>
      expect(container.querySelectorAll(".hljs-keyword")).toHaveLength(1)
    );
    const rows = screen.getAllByTestId("excerpt-line");
    expect(within(rows[1]).getByText("return answer;")).not.toBeNull();
  });

  it("caps a long excerpt and reveals the rest on demand", async () => {
    const content = ["1\ta", "2\tb", "3\tc", "4\td"].join("\n");

    render(<FileExcerptView filePath="a.txt" content={content} lineCap={2} />);

    expect(screen.getAllByTestId("excerpt-line")).toHaveLength(2);

    const reveal = screen.getByRole("button");
    expect(reveal.textContent).toContain("2");
    await userEvent.click(reveal);

    expect(screen.getAllByTestId("excerpt-line")).toHaveLength(4);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("drops the gutter for output that carries no line numbers", () => {
    render(
      <FileExcerptView filePath="a.ts" content={"plain output\nno numbers"} />
    );

    const rows = screen.getAllByTestId("excerpt-line");
    expect(within(rows[0]).getByText("plain output")).not.toBeNull();
    // One child only: the text. No gutter column was drawn.
    expect(rows[0].children).toHaveLength(1);
  });
});
