import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConversationView } from "@/conversation/ConversationView";
import type { Chat, Message } from "@/types";

const chat: Chat = {
  id: "c1",
  sourceId: "s1",
  agent: "claude",
  title: "Typography demo",
  project: "/home/dev/proj",
  projectPath: null,
  sourceFilePath: null,
  createdAt: 0,
  updatedAt: 0,
};

function renderMessages(messages: Message[]) {
  return render(<ConversationView chat={chat} messages={messages} />);
}

function assistant(text: string): Message {
  return {
    role: "assistant",
    content: text,
    timestamp: "2024-01-01T00:00:00Z",
  };
}

describe("Conversation markdown typography", () => {
  it("renders markdown links that open in a new tab", async () => {
    renderMessages([assistant("See the [docs](https://example.com) page.")]);

    const link = await screen.findByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("wraps wide tables in a horizontal-scroll container", async () => {
    renderMessages([
      assistant("| Name | Value |\n| --- | --- |\n| alpha | 1 |\n"),
    ]);

    const table = await screen.findByRole("table");
    expect(table.closest(".overflow-x-auto")).not.toBeNull();
  });

  it("renders expanded thinking content as markdown", async () => {
    const user = userEvent.setup();
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            role: "assistant",
            content: [{ type: "thinking", thinking: "- first\n- second\n" }],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    await user.click(await screen.findByText("Thinking..."));

    const items = await screen.findAllByRole("listitem");
    expect(items.map((el) => el.textContent)).toEqual(["first", "second"]);
  });

  it("keeps a very long unbroken string inside a wrapping container", async () => {
    const longToken = "a".repeat(400);
    renderMessages([assistant(longToken)]);

    const text = await screen.findByText(longToken);
    const prose = text.closest(".prose");
    expect(prose).not.toBeNull();
    // overflow-wrap:anywhere is what lets the token break instead of
    // overflowing the pane; assert the container carries it.
    expect(prose?.className).toContain("[overflow-wrap:anywhere]");
  });
});
