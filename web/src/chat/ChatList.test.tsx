import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

describe("ChatList selection", () => {
  it("toggles selection on Cmd/Ctrl+click of the row body, without opening it", async () => {
    const onSelect = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId={null}
        onSelect={onSelect}
        onDelete={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onRangeSelect={vi.fn()}
      />
    );

    const row = (await screen.findByText("Chat 2")).closest("button")!;
    fireEvent.click(row, { metaKey: true });

    expect(onToggleSelect).toHaveBeenCalledWith("clog_2");
    // A modifier click is a selection gesture, not an open.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("range-selects (replacing) on Shift+click of the row body, without opening it", async () => {
    const onSelect = vi.fn();
    const onRangeSelect = vi.fn();
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId="clog_0"
        onSelect={onSelect}
        onDelete={vi.fn()}
        selectedIds={new Set(["clog_0"])}
        onToggleSelect={vi.fn()}
        onRangeSelect={onRangeSelect}
      />
    );

    const row = (await screen.findByText("Chat 3")).closest("button")!;
    fireEvent.click(row, { shiftKey: true });

    // Not additive (no meta), so the second arg is false.
    expect(onRangeSelect).toHaveBeenCalledWith("clog_3", false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("adds an additive range on Cmd/Ctrl+Shift+click", async () => {
    const onRangeSelect = vi.fn();
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId="clog_0"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        selectedIds={new Set(["clog_0"])}
        onToggleSelect={vi.fn()}
        onRangeSelect={onRangeSelect}
      />
    );

    const row = (await screen.findByText("Chat 3")).closest("button")!;
    fireEvent.click(row, { shiftKey: true, metaKey: true });

    expect(onRangeSelect).toHaveBeenCalledWith("clog_3", true);
  });

  it("opens the chat on a plain row click (no modifier)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId={null}
        onSelect={onSelect}
        onDelete={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onRangeSelect={vi.fn()}
      />
    );

    await user.click(await screen.findByText("Chat 2"));

    expect(onSelect).toHaveBeenCalledWith("clog_2");
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it("gives the primary a strong accent and a marked non-primary a lighter fill, with no checkbox", async () => {
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId="clog_2"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        selectedIds={new Set(["clog_2", "clog_3"])}
        onToggleSelect={vi.fn()}
        onRangeSelect={vi.fn()}
      />
    );

    // Primary (Open Chat): strong left primary border.
    const primary = (await screen.findByText("Chat 2")).closest("button")!;
    expect(primary.className).toContain("border-l-primary");

    // Marked but not primary: lighter fill, no left primary border.
    const marked = screen.getByText("Chat 3").closest("button")!;
    expect(marked.className).toContain("bg-primary/10");
    expect(marked.className).not.toContain("border-l-primary");

    // Unmarked: neither.
    const other = screen.getByText("Chat 1").closest("button")!;
    expect(other.className).not.toContain("border-l-primary");
    expect(other.className).not.toContain("bg-primary/10");

    // The checkbox affordance is gone.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows the batch bar with the count and wires Clear + Move to Trash", async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();
    const onBatchTrash = vi.fn();
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        selectedIds={new Set(["clog_0", "clog_2"])}
        onToggleSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onClearSelection={onClearSelection}
        onBatchTrash={onBatchTrash}
      />
    );

    const bar = await screen.findByTestId("batch-bar");
    expect(bar).toHaveTextContent("2 selected");

    await user.click(
      within(bar).getByRole("button", { name: /Move to Trash/i })
    );
    expect(onBatchTrash).toHaveBeenCalledTimes(1);

    await user.click(within(bar).getByRole("button", { name: "Clear" }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("hides the batch bar for a lone Open Chat (size 1) and when nothing is selected", async () => {
    const { rerender } = render(
      <ChatList
        chats={makeChats(5)}
        selectedId="clog_2"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        selectedIds={new Set(["clog_2"])}
        onToggleSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onClearSelection={vi.fn()}
        onBatchTrash={vi.fn()}
      />
    );

    await screen.findAllByTestId("chat-row");
    // A single-member Selection (just the Open Chat) shows no batch UI.
    expect(screen.queryByTestId("batch-bar")).toBeNull();

    rerender(
      <ChatList
        chats={makeChats(5)}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onClearSelection={vi.fn()}
        onBatchTrash={vi.fn()}
      />
    );
    expect(screen.queryByTestId("batch-bar")).toBeNull();
  });

  it("collapses a multi-selection (≥2) on Escape", async () => {
    const onClearSelection = vi.fn();
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId="clog_1"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        selectedIds={new Set(["clog_1", "clog_2"])}
        onToggleSelect={vi.fn()}
        onRangeSelect={vi.fn()}
        onClearSelection={onClearSelection}
        onBatchTrash={vi.fn()}
      />
    );

    await screen.findAllByTestId("chat-row");
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});

describe("ChatList keyboard cursor", () => {
  it("renders the focus-ring Cursor on the row ArrowDown lands on", async () => {
    render(
      <ChatList
        chats={makeChats(5)}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await screen.findAllByTestId("chat-row");

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    });

    await waitFor(() => {
      const cursorRow = document.querySelector('[data-cursor="true"]');
      expect(cursorRow).not.toBeNull();
      expect(cursorRow).toHaveTextContent("Chat 0");
    });
  });
});

describe("ChatList infinite scroll", () => {
  it("requests the next page when the rendered window nears the end", async () => {
    const onLoadMore = vi.fn();
    render(
      <ChatList
        chats={makeChats(8)}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        hasMore
        onLoadMore={onLoadMore}
      />
    );

    await screen.findAllByTestId("chat-row");
    await waitFor(() => expect(onLoadMore).toHaveBeenCalled());
  });

  it("does not request more when there is no next page", async () => {
    const onLoadMore = vi.fn();
    render(
      <ChatList
        chats={makeChats(8)}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        hasMore={false}
        onLoadMore={onLoadMore}
      />
    );

    await screen.findAllByTestId("chat-row");
    // Let the virtualizer settle (ResizeObserver fires asynchronously).
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
