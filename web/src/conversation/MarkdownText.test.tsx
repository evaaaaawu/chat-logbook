import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
