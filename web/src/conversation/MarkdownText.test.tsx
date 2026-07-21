import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownText } from "@/conversation/MarkdownText";

describe("MarkdownText line breaks", () => {
  it("keeps a single newline as a visible line break", () => {
    // People write chat messages with Enter, not with markdown's blank-line
    // paragraph rule. Plain markdown folds a single newline into a space, which
    // silently reflows what the reader actually wrote.
    const { container } = render(
      <MarkdownText>{"first line\nsecond line"}</MarkdownText>
    );

    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).toContain("first line");
    expect(container.textContent).toContain("second line");
  });

  it("still separates blank-line-delimited paragraphs", () => {
    const { container } = render(
      <MarkdownText>{"first para\n\nsecond para"}</MarkdownText>
    );

    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("leaves markdown structure intact", () => {
    const { container } = render(
      <MarkdownText>{"- one\n- two\n\n**bold** and `code`"}</MarkdownText>
    );

    // A list's own newlines are structure, not prose breaks: two items, and no
    // stray <br> injected between them.
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("li br")).toBeNull();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });
});

describe("MarkdownText code block copying", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("copies a code block's source, without the highlighting markup", async () => {
    // Highlighting wraps keywords in spans; what the reader takes away has to
    // be the code they could paste back into a file.
    render(
      <MarkdownText>{"```ts\nconst x = 1;\nreturn x;\n```"}</MarkdownText>
    );

    await userEvent.click(screen.getByRole("button", { name: "Copy code" }));

    expect(writeText).toHaveBeenCalledWith("const x = 1;\nreturn x;");
  });

  it("offers no copy button for inline code", () => {
    // Inline code is a word inside a sentence, not something to take away.
    render(<MarkdownText>{"use the `id` field"}</MarkdownText>);

    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  });
});
