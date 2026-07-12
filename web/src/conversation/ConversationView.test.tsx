import { render, screen, fireEvent, act } from "@testing-library/react";
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

// Give the scroll panel real geometry so the pill logic sees a scrollable,
// scrolled-up viewport (jsdom reports 0 for scroll metrics). Returns a setter
// for scrollTop that also fires the scroll handler.
function makeScrollable(
  panel: HTMLElement,
  { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }
) {
  Object.defineProperty(panel, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(panel, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  let top = 0;
  Object.defineProperty(panel, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
    },
  });
  return {
    scrollTo(v: number) {
      top = v;
      fireEvent.scroll(panel);
    },
  };
}

describe("Conversation live arrival", () => {
  const three = [assistant("one"), assistant("two"), assistant("three")];
  const four = [...three, assistant("four")];

  it("marks unread and holds the viewport when messages arrive scrolled up", async () => {
    const { rerender } = render(
      <ConversationView chat={chat} messages={three} />
    );

    const panel = await screen.findByTestId("conversation-panel");
    const scroller = makeScrollable(panel, {
      scrollHeight: 1000,
      clientHeight: 300,
    });
    // Scroll up, away from the bottom.
    act(() => scroller.scrollTo(0));
    await screen.findByRole("button", { name: "Jump to bottom" });

    // A live message appends below.
    act(() => rerender(<ConversationView chat={chat} messages={four} />));

    // The viewport did not move; a "new messages" pill and an unread divider
    // both appear.
    expect(panel.scrollTop).toBe(0);
    expect(screen.getByRole("button", { name: "New messages" })).not.toBeNull();
    expect(
      screen.getByRole("separator", { name: "New messages" })
    ).not.toBeNull();
  });

  it("consumes the pill on click but keeps the divider for the session", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ConversationView chat={chat} messages={three} />
    );

    const panel = await screen.findByTestId("conversation-panel");
    const scroller = makeScrollable(panel, {
      scrollHeight: 1000,
      clientHeight: 300,
    });
    act(() => scroller.scrollTo(0));
    await screen.findByRole("button", { name: "Jump to bottom" });

    act(() => rerender(<ConversationView chat={chat} messages={four} />));
    await user.click(screen.getByRole("button", { name: "New messages" }));

    // Acting on the pill consumes it; the divider persists (the reader can still
    // see where they left off) until the chat changes.
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
    expect(
      screen.getByRole("separator", { name: "New messages" })
    ).not.toBeNull();
  });

  it("follows the latest with no divider or pill when arriving at the bottom", async () => {
    const { rerender } = render(
      <ConversationView chat={chat} messages={three} />
    );
    await screen.findByTestId("conversation-panel");

    // Pinned at the bottom (the pane opens there), a live message appends.
    act(() => rerender(<ConversationView chat={chat} messages={four} />));

    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
    expect(
      screen.queryByRole("separator", { name: "New messages" })
    ).toBeNull();
  });

  it("clears the divider and pill when the chat changes", async () => {
    const { rerender } = render(
      <ConversationView chat={chat} messages={three} />
    );

    const panel = await screen.findByTestId("conversation-panel");
    const scroller = makeScrollable(panel, {
      scrollHeight: 1000,
      clientHeight: 300,
    });
    act(() => scroller.scrollTo(0));
    await screen.findByRole("button", { name: "Jump to bottom" });
    act(() => rerender(<ConversationView chat={chat} messages={four} />));
    expect(screen.getByRole("button", { name: "New messages" })).not.toBeNull();

    // Open a different chat: the unread state belongs to the old one.
    const other: Chat = { ...chat, id: "c2", title: "Another chat" };
    act(() =>
      rerender(
        <ConversationView chat={other} messages={[assistant("fresh")]} />
      )
    );

    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
    expect(
      screen.queryByRole("separator", { name: "New messages" })
    ).toBeNull();
  });
});

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
