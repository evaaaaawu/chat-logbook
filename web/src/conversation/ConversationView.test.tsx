import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConversationView } from "@/conversation/ConversationView";
import { messageAnchorId } from "@/conversation/messageAnchor";
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

let nextMessageId = 0;

function assistant(text: string): Message {
  return {
    id: `m-${(nextMessageId += 1)}`,
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

describe("Conversation note-style headers", () => {
  it("names the assistant by its agent display name, never ASSISTANT", async () => {
    render(
      <ConversationView
        chat={{ ...chat, agent: "claude-code" }}
        messages={[assistant("Sure, here goes.")]}
      />
    );

    expect(await screen.findByText("Claude Code")).not.toBeNull();
    // The literal role name is the thing this layout replaces: an archive
    // header should read like a person's name, not a wire-protocol value.
    expect(screen.queryByText(/^assistant$/i)).toBeNull();
  });

  it("stamps every header with an absolute date and time", async () => {
    // A single-day session still carries the date (#192): the header is read as
    // a record of when something happened, not only where it sits in the day.
    // Asserted by shape, not a literal — the value renders in the reader's
    // local timezone, and the suite pins no TZ.
    renderMessages([assistant("one")]);

    expect(
      await screen.findByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    ).not.toBeNull();
  });

  it("names the reader's own turns You", async () => {
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-ask",
            role: "user",
            content: "Build a login page",
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    expect(await screen.findByText("You")).not.toBeNull();
  });
});

describe("Conversation note-style layout", () => {
  async function renderBothRoles() {
    const { container } = render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-ask",
            role: "user",
            content: "Build a login page",
            timestamp: "2024-01-01T00:00:00Z",
          },
          assistant("Sure, here goes."),
        ]}
      />
    );
    await screen.findByText("Sure, here goes.");
    return {
      user: container.querySelector('[data-role="user"]')!,
      assistant: container.querySelector('[data-role="assistant"]')!,
    };
  }

  it("gives user turns a background block and assistant turns none", async () => {
    // The reader's own turns are the scanning anchors in a long session; the
    // Agent's prose sits directly on the pane (#192).
    const { user, assistant: agent } = await renderBothRoles();

    expect(user.className).toContain("bg-card");
    expect(agent.className).not.toContain("bg-");
  });

  it("lays both roles out full-width, with no bubbles or side alignment", async () => {
    const { user, assistant: agent } = await renderBothRoles();

    // A document flow, not a chat transcript: nothing is pushed to a side or
    // capped to a bubble's width.
    for (const el of [user, agent]) {
      expect(el.className).not.toContain("self-end");
      expect(el.className).not.toContain("self-start");
      expect(el.className).not.toContain("max-w-[85%]");
    }
  });
});

describe("Conversation message anchors", () => {
  it("anchors each message to its message id, not its position", async () => {
    // The anchor is this layout's public contract (#192): Spotlight (#25)
    // scrolls to an exact Message through it, so it must survive turns being
    // dropped, reordered, or arriving live — which a positional index does not.
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-user",
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "ok" },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
          {
            id: "m-assistant",
            role: "assistant",
            content: "Sure, here goes.",
            timestamp: "2024-01-01T00:01:00Z",
          },
        ]}
      />
    );

    await screen.findByText("Sure, here goes.");
    // The empty first turn is dropped, so the surviving message sits at index
    // 0 — its anchor must still name the message, not that position.
    const anchored = document.getElementById(messageAnchorId("m-assistant"));
    expect(anchored).not.toBeNull();
    expect(anchored!.textContent).toContain("Sure, here goes.");
  });
});

describe("Conversation empty-turn suppression", () => {
  it("drops a turn whose content renders nothing at all", async () => {
    // A user turn carrying only tool results is a harness artifact, not
    // something the reader wrote. It has nothing to show, so it contributes no
    // header and no block — rather than an empty "You" box (#192).
    const { container } = render(
      <ConversationView
        chat={chat}
        messages={[
          assistant("Sure, running that now."),
          {
            id: "m-tool-result",
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "ok" },
            ],
            timestamp: "2024-01-01T00:01:00Z",
          },
        ]}
      />
    );

    await screen.findByText("Sure, running that now.");
    expect(screen.queryByText("You")).toBeNull();
    expect(container.querySelector('[data-role="user"]')).toBeNull();
  });
});

describe("Conversation system rows", () => {
  const NOTIFICATION_DETAIL =
    "<task-notification><status>completed</status></task-notification>";
  const notificationTurn: Message = {
    id: "m-sys",
    role: "user",
    content: [
      {
        type: "system",
        kind: "task-notification",
        summary: 'Agent "Run App test" finished',
        detail: NOTIFICATION_DETAIL,
      },
    ],
    timestamp: "2024-01-01T00:00:00Z",
  };

  it("renders harness noise as a collapsed row showing only its summary", async () => {
    const { container } = render(
      <ConversationView chat={chat} messages={[notificationTurn]} />
    );

    await screen.findByText('Agent "Run App test" finished');
    // Collapsed by default: the detail is what the reader opts into.
    expect(screen.queryByTestId("unit-detail")).toBeNull();
    // The harness markup must never reach the screen unbidden (ADR-0023).
    expect(container.textContent).not.toContain("<task-notification>");
  });

  it("reveals the full notification when the row is expanded", async () => {
    render(<ConversationView chat={chat} messages={[notificationTurn]} />);

    const row = await screen.findByRole("button", {
      name: /Run App test/,
    });
    await userEvent.click(row);

    const detail = await screen.findByTestId("unit-detail");
    expect(detail.textContent).toContain(NOTIFICATION_DETAIL);
  });

  it("offers no expand affordance when the summary is the whole of it", async () => {
    // A local command echo is one line. Opening it would reveal nothing, so the
    // row stays a plain line rather than a control that does nothing.
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-echo",
            role: "user",
            content: [
              {
                type: "system",
                kind: "local-command-stdout",
                summary: "Set model to claude-opus-4-8",
                detail: "",
              },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    await screen.findByText("Set model to claude-opus-4-8");
    expect(screen.queryByRole("button", { name: /Set model/ })).toBeNull();
    expect(screen.queryByTestId("row-chevron")).toBeNull();
  });

  it("gives a system row no You header, since nobody wrote it", async () => {
    // The Agent logs harness noise as a user turn, but it is machinery talking
    // to the Agent — attributing it to the reader is the bug (ADR-0023).
    render(
      <ConversationView
        chat={chat}
        messages={[assistant("Kicking that off."), notificationTurn]}
      />
    );

    await screen.findByText('Agent "Run App test" finished');
    expect(screen.queryByText("You")).toBeNull();
  });
});

describe("Conversation command lines", () => {
  const commandTurn: Message = {
    id: "m-cmd",
    role: "user",
    content: [{ type: "command", name: "/tdd", args: "issue 191" }],
    timestamp: "2024-01-01T00:00:00Z",
  };

  it("renders a command invocation as a command line, with no raw markup", async () => {
    const { container } = render(
      <ConversationView chat={chat} messages={[commandTurn]} />
    );

    const line = await screen.findByTestId("command-line");
    expect(line.textContent).toContain("/tdd issue 191");
    // The Agent's private markup must never reach the screen (ADR-0023).
    expect(container.textContent).not.toContain("<command-name>");
  });

  it("shows multi-line args in full, without truncating", async () => {
    // A slash command can carry a whole prompt as its args, including blank
    // lines. It reads like the reader's own message, so every line stays.
    const { container } = render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-cmd-multiline",
            role: "user",
            content: [
              {
                type: "command",
                name: "/tdd",
                args: "issue 191\n\np.s. see PR #225.",
              },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    const line = await screen.findByTestId("command-line");
    // The blank line between the args and the p.s. survives to the DOM — the
    // component neither collapses nor truncates it (the CSS then renders it).
    expect(line.textContent).toContain("issue 191\n\np.s. see PR #225.");
    expect(container.textContent).not.toContain("<command-args>");
  });

  it("keeps the reader's authored turn: a You header and a background block", async () => {
    const { container } = render(
      <ConversationView chat={chat} messages={[commandTurn]} />
    );

    expect(await screen.findByText("You")).not.toBeNull();
    expect(container.querySelector('[data-role="user"]')).not.toBeNull();
  });
});

describe("Conversation collapsed units", () => {
  it("gives a tool-only turn its collapsed row but no header of its own", async () => {
    // Tool calls nest under the message that prompted them (#192). The Agent
    // records them as separate turns, but the reader sees one authored moment,
    // so the run of tool calls must not repeat the author header.
    render(
      <ConversationView
        chat={{ ...chat, agent: "claude-code" }}
        messages={[
          assistant("Let me check that file."),
          {
            id: "m-tool-use",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Read",
                input: { file_path: "/tmp/a.ts" },
              },
            ],
            timestamp: "2024-01-01T00:01:00Z",
          },
        ]}
      />
    );

    // The collapsed row is still rendered — it is content, just not authored.
    expect(await screen.findByText("Read: /tmp/a.ts")).not.toBeNull();
    // ...but the header belongs to the text turn alone.
    expect(screen.getAllByText("Claude Code")).toHaveLength(1);
  });
});

describe("Conversation tool units", () => {
  it("shows the tool's result when the unit is expanded", async () => {
    // A call and its result are one unit: the reader asks "what did Read
    // return?", not "which turn was the result recorded under" (#193).
    const user = userEvent.setup();
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-tool",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Read",
                input: { file_path: "/tmp/a.ts" },
              },
              {
                type: "tool_result",
                tool_use_id: "t1",
                content: "export const answer = 42;",
              },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    await user.click(await screen.findByText("Read: /tmp/a.ts"));

    expect(await screen.findByText(/export const answer = 42;/)).not.toBeNull();
  });

  it("pairs a call with a result recorded in the next turn", async () => {
    // The common shape in a real log: the Agent calls a tool, and the harness
    // records the result as a user turn of its own. That turn renders nothing
    // and is dropped before layout (#192), so pairing must read the unfiltered
    // list — otherwise the result vanishes with the turn that carried it.
    const user = userEvent.setup();
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-call",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "pnpm test" },
              },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
          {
            id: "m-result",
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "17 passed" },
            ],
            timestamp: "2024-01-01T00:01:00Z",
          },
        ]}
      />
    );

    await user.click(await screen.findByText("Bash: pnpm test"));

    expect(await screen.findByText(/17 passed/)).not.toBeNull();
  });

  it("shows input and output under one left rule marking the unit's extent", async () => {
    // The rule is what makes an expanded unit read as a nested aside rather
    // than more prose: it marks where the unit's detail starts and ends (#193).
    const user = userEvent.setup();
    const { container } = render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-tool",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "pnpm test" },
              },
              { type: "tool_result", tool_use_id: "t1", content: "17 passed" },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    await user.click(await screen.findByText("Bash: pnpm test"));

    const detail = container.querySelector('[data-testid="unit-detail"]')!;
    expect(detail).not.toBeNull();
    expect(detail.className).toContain("border-l");
    // Both halves of the unit live inside that extent.
    expect(detail.textContent).toContain("pnpm test");
    expect(detail.textContent).toContain("17 passed");
  });

  it("makes the collapsed row obviously toggleable", async () => {
    // A row that toggles must look like it toggles: a leading chevron, a
    // pointer cursor, and a hover background. Without them the reader has no
    // reason to try clicking, and the result stays hidden (#193).
    const user = userEvent.setup();
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-tool",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Read",
                input: { file_path: "/tmp/a.ts" },
              },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    const row = await screen.findByRole("button", {
      name: /Read: \/tmp\/a\.ts/,
    });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row.querySelector('[data-testid="row-chevron"]')).not.toBeNull();
    expect(row.className).toContain("cursor-pointer");
    expect(row.className).toContain("hover:bg-");

    await user.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("renders thinking with the same collapsible row as tool units", async () => {
    // Thinking and tool units are the same kind of thing to a reader — skimmed
    // past by default, opened on demand — so they share one row rather than
    // each inventing their own affordance (#193).
    const user = userEvent.setup();
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-thinking",
            role: "assistant",
            content: [{ type: "thinking", thinking: "weighing the options" }],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    const row = await screen.findByRole("button", { name: /Thinking/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row.querySelector('[data-testid="row-chevron"]')).not.toBeNull();
    expect(row.className).toContain("cursor-pointer");

    await user.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("weighing the options")).not.toBeNull();
  });

  it("marks a failed result on the collapsed row", async () => {
    // A failure is the thing a reader scans a session for. It has to show
    // without expanding, or every row must be opened to find it (#193).
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-call",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "pnpm test" },
              },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
          {
            id: "m-result",
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t1",
                content: "1 failed",
                is_error: true,
              },
            ],
            timestamp: "2024-01-01T00:01:00Z",
          },
        ]}
      />
    );

    const row = await screen.findByRole("button", { name: /Bash: pnpm test/ });
    expect(row.querySelector('[data-testid="row-error"]')).not.toBeNull();
  });

  it("leaves a successful result unmarked", async () => {
    render(
      <ConversationView
        chat={chat}
        messages={[
          {
            id: "m-tool",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "pnpm test" },
              },
              { type: "tool_result", tool_use_id: "t1", content: "17 passed" },
            ],
            timestamp: "2024-01-01T00:00:00Z",
          },
        ]}
      />
    );

    const row = await screen.findByRole("button", { name: /Bash: pnpm test/ });
    expect(row.querySelector('[data-testid="row-error"]')).toBeNull();
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
            id: "m-thinking",
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
