import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Chat } from "@/types";
import { ChatList } from "./ChatList";

function makeChat(index: number): Chat {
  return {
    id: `clog_${index}`,
    sourceId: `src_${index}`,
    agent: "claude",
    title: `Chat ${index}`,
    project: "/home/user/my-web-app",
    projectPath: "/home/user/my-web-app",
    sourceFilePath: null,
    createdAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index,
  };
}

function makeChats(count: number): Chat[] {
  return Array.from({ length: count }, (_, i) => makeChat(i));
}

describe("ChatList virtualization", () => {
  it("renders only the visible window of a large list, not every row", async () => {
    // Kept modest: jsdom does no layout, so react-virtual mounts and measures a
    // count proportional to the list size here (a real browser renders ~one
    // screenful regardless). A larger list just makes the test slow without
    // strengthening the invariant below.
    const total = 100;
    render(
      <ChatList
        chats={makeChats(total)}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // jsdom does no layout, so react-virtual can't reproduce the exact small
    // window (or which indices it lands on, or a stable count) that a real
    // browser would. The invariant we can assert deterministically — and the
    // one that separates a virtualized list from the old render-everything
    // list — is that only a strict subset of rows is ever in the DOM, never all
    // of them.
    const rows = await screen.findAllByTestId("chat-row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(total);
  });

  it("selects a chat when a rendered row is clicked", async () => {
    // A small list renders entirely (no windowing drift), so the clicked row
    // stays mounted — selection wiring is the same code path at any size.
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId={null}
        onSelect={onSelect}
        onDelete={vi.fn()}
      />
    );

    await user.click(await screen.findByText("Chat 3"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("clog_3");
  });

  it("windows the Trash view with the same rendering", async () => {
    const total = 100;
    render(
      <ChatList
        mode="trash"
        chats={makeChats(total)}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRestore={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const rows = await screen.findAllByTestId("chat-row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(total);
  });
});
