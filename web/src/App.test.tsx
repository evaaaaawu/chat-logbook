import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, it, expect, vi } from "vitest";
import App from "./App";
import { server } from "./test/server";
import {
  fakeChats,
  fakeChatTags,
  seedChatTags,
  seedTags,
} from "./test/handlers";

describe("Chat list", () => {
  it("displays session titles fetched from the API", async () => {
    render(<App />);

    expect(await screen.findByText("Build a login page")).toBeInTheDocument();
    expect(screen.getByText("Fix database migration")).toBeInTheDocument();
  });

  it("displays project name and relative time for each session", async () => {
    render(<App />);

    await screen.findByText("Build a login page");

    // Project name: last segment of path. Scope to the chat list — the
    // navigation panel's Projects section also renders these names.
    const list = screen.getByTestId("chat-list");
    expect(
      within(list).getAllByText("my-web-app").length
    ).toBeGreaterThanOrEqual(1);
    expect(within(list).getByText("backend-api")).toBeInTheDocument();
  });

  it("sorts sessions by updatedAt descending (most recent first)", async () => {
    render(<App />);

    await screen.findByText("Fix database migration");

    const list = screen.getByTestId("chat-list");
    const rowButtons = within(list)
      .getAllByRole("button")
      .filter((el) => !el.getAttribute("aria-label"));
    const titles = rowButtons.map((item) => item.textContent);

    // session-2 has updatedAt 1700000300000 (newer)
    // session-1 has updatedAt 1700000200000 (older)
    expect(titles[0]).toContain("Fix database migration");
    expect(titles[1]).toContain("Build a login page");
  });
});

describe("Chat List sort", () => {
  it("opens a sort popover listing Title, Created time, and Updated time", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));

    const popover = await screen.findByTestId("chat-sort-popover");
    expect(within(popover).getByText("Title")).toBeInTheDocument();
    expect(within(popover).getByText("Created time")).toBeInTheDocument();
    expect(within(popover).getByText("Updated time")).toBeInTheDocument();
  });

  it("re-sorts the list A-Z when Title is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    const list = screen.getByTestId("chat-list");
    // Default (Updated time · Newest first): Fix database migration is first.
    expect(within(list).getAllByTestId("chat-row")[0].textContent).toContain(
      "Fix database migration"
    );

    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Title"));

    // Title A-Z: Build a login page first, Untitled (empty-ish) reorders down.
    const rows = within(list).getAllByTestId("chat-row");
    expect(rows[0].textContent).toContain("Build a login page");
    expect(rows[1].textContent).toContain("Fix database migration");
    expect(rows[2].textContent).toContain("Refactor utils");
  });

  it("toggles direction by re-clicking the active axis and re-sorts", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");

    // First click selects Title (A-Z); the direction label reads A-Z.
    await user.click(within(popover).getByText("Title"));
    expect(within(popover).getByText("A-Z")).toBeInTheDocument();

    // Re-clicking the already-active axis flips its direction.
    await user.click(within(popover).getByText("Title"));

    // Z-A: the label flips and the order reverses ("Untitled" is a real title,
    // so it leads in Z-A; "Build a login page" sinks to the bottom).
    expect(within(popover).getByText("Z-A")).toBeInTheDocument();
    const rows = within(list).getAllByTestId("chat-row");
    expect(rows[0].textContent).toContain("Untitled");
    expect(rows[3].textContent).toContain("Build a login page");
  });

  it("persists the sort preference across a reload", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await screen.findByText("Build a login page");
    let list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Title"));

    unmount();
    render(<App />);

    await screen.findByText("Build a login page");
    list = screen.getByTestId("chat-list");
    const rows = within(list).getAllByTestId("chat-row");
    expect(rows[0].textContent).toContain("Build a login page");
  });

  it("tints the sort icon primary cyan only when the sort is non-default", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    const list = screen.getByTestId("chat-list");
    const trigger = within(list).getByRole("button", { name: /sort/i });

    // Default (Updated time · Newest first): muted, not cyan.
    expect(trigger.className).toMatch(/text-muted-foreground/);
    expect(trigger.className).not.toMatch(/text-primary/);

    await user.click(trigger);
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Title"));

    // Non-default: cyan.
    expect(trigger.className).toMatch(/text-primary/);
  });

  it("remembers each axis's direction when switching between axes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");

    // Title: select, then re-click to flip to Z-A.
    await user.click(within(popover).getByText("Title"));
    await user.click(within(popover).getByText("Title"));
    expect(within(popover).getByText("Z-A")).toBeInTheDocument();

    // Updated time: its own untouched default (Newest first).
    await user.click(within(popover).getByText("Updated time"));
    expect(within(popover).getByText("Newest first")).toBeInTheDocument();

    // Back to Title: the Z-A choice is restored (a plain select, not a flip).
    await user.click(within(popover).getByText("Title"));
    expect(within(popover).getByText("Z-A")).toBeInTheDocument();
  });

  it("scrolls the selected chat into view after a sort change", async () => {
    // The virtualized list keeps the selection visible via the virtualizer,
    // which scrolls the container by index (Element.scrollTo) rather than
    // calling scrollIntoView on a row that may not be rendered.
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    scrollTo.mockClear();

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Title"));

    expect(scrollTo).toHaveBeenCalled();
  });

  it("scrolls the list to top after a sort change when nothing is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    const scroller = screen.getByTestId("chat-scroll");
    scroller.scrollTop = 100;

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Title"));

    expect(scroller.scrollTop).toBe(0);
  });
});

describe("Conversation header", () => {
  it("shows the session title and project after selecting a session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));

    const header = await screen.findByTestId("conversation-header");
    expect(within(header).getByText("Build a login page")).toBeInTheDocument();
    expect(within(header).getByText(/my-web-app/)).toBeInTheDocument();
  });
});

describe("Chat metadata popover", () => {
  it("hides the ⓘ trigger when no chat is selected, shows it after selecting one", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    expect(
      screen.queryByRole("button", { name: /chat info/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Build a login page"));

    const header = await screen.findByTestId("conversation-header");
    expect(
      within(header).getByRole("button", { name: /chat info/i })
    ).toBeInTheDocument();
  });

  it("opens the popover on trigger click and closes on Esc", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));

    const trigger = await screen.findByRole("button", { name: /chat info/i });
    await user.click(trigger);

    expect(await screen.findByTestId("chat-metadata-popover")).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByTestId("chat-metadata-popover")
      ).not.toBeInTheDocument();
    });
  });

  it("renders chat id, source id, and AI agent display name", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.click(await screen.findByRole("button", { name: /chat info/i }));

    const popover = await screen.findByTestId("chat-metadata-popover");
    expect(within(popover).getByText("CHAT01")).toBeInTheDocument();
    expect(within(popover).getByText("chat-1")).toBeInTheDocument();
    expect(within(popover).getByText("Claude Code")).toBeInTheDocument();
    expect(within(popover).queryByText("claude-code")).not.toBeInTheDocument();
  });

  it("renders project and source file path with full value in title tooltip", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.click(await screen.findByRole("button", { name: /chat info/i }));

    const popover = await screen.findByTestId("chat-metadata-popover");
    expect(
      within(popover).getByTitle("/Users/test/my-web-app")
    ).toBeInTheDocument();
    expect(
      within(popover).getByTitle(
        "/Users/test/.claude/projects/my-web-app/chat-1.jsonl"
      )
    ).toBeInTheDocument();
  });

  it("renders the full projectPath (not just basename) when provided", async () => {
    server.use(
      http.get("/api/chats", () =>
        HttpResponse.json({
          chats: [
            {
              id: "chat-x",
              sourceId: "CHATXX",
              agent: "claude-code",
              title: "Full path chat",
              project: "chat-logbook",
              projectPath: "/Users/evaaaaawu/Documents/chat-logbook",
              sourceFilePath: null,
              createdAt: 1700000000000,
              updatedAt: 1700000000000,
            },
          ],
        })
      )
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Full path chat"));
    await user.click(await screen.findByRole("button", { name: /chat info/i }));

    const popover = await screen.findByTestId("chat-metadata-popover");
    const projectRow = within(popover).getByText("Project").parentElement!;
    expect(
      within(projectRow).getByTitle("/Users/evaaaaawu/Documents/chat-logbook")
    ).toBeInTheDocument();
    expect(
      within(projectRow).getByText("/Users/evaaaaawu/Documents/chat-logbook")
    ).toBeInTheDocument();
  });

  it("falls back to project basename when projectPath is null", async () => {
    server.use(
      http.get("/api/chats", () =>
        HttpResponse.json({
          chats: [
            {
              id: "chat-y",
              sourceId: "CHATYY",
              agent: "claude-code",
              title: "Basename fallback chat",
              project: "legacy-basename",
              projectPath: null,
              sourceFilePath: null,
              createdAt: 1700000000000,
              updatedAt: 1700000000000,
            },
          ],
        })
      )
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Basename fallback chat"));
    await user.click(await screen.findByRole("button", { name: /chat info/i }));

    const popover = await screen.findByTestId("chat-metadata-popover");
    const projectRow = within(popover).getByText("Project").parentElement!;
    expect(within(projectRow).getByText("legacy-basename")).toBeInTheDocument();
  });

  it("renders — when project is empty", async () => {
    server.use(
      http.get("/api/chats", () =>
        HttpResponse.json({
          chats: [
            {
              id: "chat-x",
              sourceId: "CHATXX",
              agent: "claude-code",
              title: "No project chat",
              project: "",
              sourceFilePath: null,
              createdAt: 1700000000000,
              updatedAt: 1700000000000,
            },
          ],
        })
      )
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("No project chat"));
    await user.click(await screen.findByRole("button", { name: /chat info/i }));

    const popover = await screen.findByTestId("chat-metadata-popover");
    const projectRow = within(popover).getByText("Project").parentElement!;
    expect(within(projectRow).getByText("—")).toBeInTheDocument();
  });

  it("renders created and updated timestamps as YYYY-MM-DD HH:mm", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.click(await screen.findByRole("button", { name: /chat info/i }));

    const popover = await screen.findByTestId("chat-metadata-popover");
    const datePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
    const matches = within(popover)
      .getAllByText(datePattern)
      .map((el) => el.textContent);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("copies the full untruncated value to clipboard and shows Copied feedback", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      render(<App />);

      await user.click(await screen.findByText("Build a login page"));
      await user.click(
        await screen.findByRole("button", { name: /chat info/i })
      );

      const popover = await screen.findByTestId("chat-metadata-popover");
      const copyPath = within(popover).getByRole("button", {
        name: /copy source path/i,
      });
      await user.click(copyPath);

      expect(writeText).toHaveBeenCalledWith(
        "/Users/test/.claude/projects/my-web-app/chat-1.jsonl"
      );
      expect(within(popover).getByText("Copied")).toBeInTheDocument();

      vi.advanceTimersByTime(1600);

      await waitFor(() => {
        expect(within(popover).queryByText("Copied")).not.toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("in Trash mode, Esc closes the popover but does not exit Trash", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    await user.click(screen.getByTestId("trash-link"));

    const deletedRow = await screen.findByText("Old prototype");
    await user.click(deletedRow);

    await user.click(await screen.findByRole("button", { name: /chat info/i }));
    expect(await screen.findByTestId("chat-metadata-popover")).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByTestId("chat-metadata-popover")
      ).not.toBeInTheDocument();
    });

    // Still in Trash: deleted chat is still in the list
    expect(
      within(screen.getByTestId("chat-list")).getByText("Old prototype")
    ).toBeInTheDocument();
  });

  it("closes the popover when switching to a different chat", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.click(await screen.findByRole("button", { name: /chat info/i }));
    expect(await screen.findByTestId("chat-metadata-popover")).toBeVisible();

    await user.click(screen.getByText("Fix database migration"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("chat-metadata-popover")
      ).not.toBeInTheDocument();
    });
  });
});

describe("Trash link in filter panel", () => {
  it("shows the server-derived trashed count on the Trash link", async () => {
    render(<App />);

    await screen.findByText("Build a login page");

    // The trashed total comes from the server counts aggregation (#131 Phase A),
    // so it is correct even though the paginated main list never loads trashed
    // chats. Two fake chats are trashed.
    const trashLink = await screen.findByTestId("trash-link");
    expect(within(trashLink).getByText(/trash/i)).toBeInTheDocument();
    expect(await within(trashLink).findByText("2")).toBeInTheDocument();
  });

  it("hides the count when Trash is empty", async () => {
    fakeChats.forEach((c) => {
      c.isDeleted = false;
      c.deletedAt = null;
    });
    render(<App />);

    await screen.findByText("Build a login page");

    const trashLink = await screen.findByTestId("trash-link");
    expect(within(trashLink).getByText(/trash/i)).toBeInTheDocument();
    expect(within(trashLink).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });
});

describe("Trash sort", () => {
  it("offers Title, Created, Updated, and Deleted time with Deleted last", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));

    const popover = await screen.findByTestId("trash-sort-popover");
    const labels = within(popover)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(labels).toEqual([
      "Title",
      "Created time",
      "Updated time",
      "Deleted time",
    ]);
  });

  it("defaults to Deleted time, newest first", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    const list = screen.getByTestId("chat-list");
    // chat-deleted-1 deletedAt 1700000200000 > chat-deleted-2 1700000100000
    const rows = within(list).getAllByTestId("chat-row");
    expect(rows[0].textContent).toContain("Old prototype");
    expect(rows[1].textContent).toContain("Newer experiment");

    // The active axis reads "Deleted time" with the "Newest first" label.
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("trash-sort-popover");
    expect(within(popover).getByText("Newest first")).toBeInTheDocument();
  });

  it("reorders by Updated time when that axis is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("trash-sort-popover");
    await user.click(within(popover).getByText("Updated time"));

    // Updated time desc: chat-deleted-2 (1699999800000) before chat-deleted-1.
    const rows = within(list).getAllByTestId("chat-row");
    expect(rows[0].textContent).toContain("Newer experiment");
    expect(rows[1].textContent).toContain("Old prototype");
  });

  it("no longer shows the 'Trash (N)' text label in the header", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    await screen.findByText("Old prototype");
    expect(screen.queryByText(/^Trash \(\d+\)$/)).not.toBeInTheDocument();
    const list = screen.getByTestId("chat-list");
    expect(
      within(list).getByRole("button", { name: /back/i })
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: /sort/i })
    ).toBeInTheDocument();
  });

  it("persists the Trash sort independently of the Chats list sort", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("trash-sort-popover");
    await user.click(within(popover).getByText("Title"));

    // Trash preference is stored under its own key; the Chats key is untouched.
    const trashPref = JSON.parse(
      localStorage.getItem("chatlogbook.sort.trash") ?? "{}"
    );
    expect(trashPref.field).toBe("title");
    expect(localStorage.getItem("chatlogbook.sort.chats")).toBeNull();

    // Back in the Chats list, the default Updated-time order still holds.
    await user.click(within(list).getByRole("button", { name: /back/i }));
    const mainRows = within(screen.getByTestId("chat-list")).getAllByTestId(
      "chat-row"
    );
    expect(mainRows[0].textContent).toContain("Fix database migration");
  });
});

describe("Soft delete from chat list", () => {
  it("removes the session from the list and moves it to Trash", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Fix database migration");

    // Deleting a single chat lives in the row's right-click menu (#215).
    fireEvent.contextMenu(screen.getByText("Fix database migration"));
    const menu = await screen.findByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /move to trash/i })
    );

    // Session should disappear from main list
    await waitFor(() => {
      expect(
        screen.queryByText("Fix database migration")
      ).not.toBeInTheDocument();
    });

    // It now lives in Trash (the count badge was dropped; the move is what the
    // user cares about).
    await user.click(screen.getByTestId("trash-link"));
    const list = screen.getByTestId("chat-list");
    expect(
      await within(list).findByText("Fix database migration")
    ).toBeInTheDocument();
  });
});

describe("Auto-select next after delete", () => {
  it("auto-selects the next session after deleting the selected one", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Select "Build a login page" (2nd in sorted main list)
    await user.click(await screen.findByText("Build a login page"));

    const header = screen.getByTestId("conversation-header");
    expect(within(header).getByText("Build a login page")).toBeInTheDocument();

    // Delete it via the row's right-click menu (#215). Scope to the list — the
    // open chat's title also shows in the conversation header.
    const list = screen.getByTestId("chat-list");
    fireEvent.contextMenu(within(list).getByText("Build a login page"));
    const menu = await screen.findByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /move to trash/i })
    );

    // Next session ("Refactor utils") should be auto-selected
    await waitFor(() => {
      expect(within(header).getByText("Refactor utils")).toBeInTheDocument();
    });
  });
});

describe("Undo toast on delete", () => {
  it("shows Undo toast after delete; clicking Undo restores the session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Fix database migration");

    // Deleting a single chat lives in the row's right-click menu (#215).
    const list = screen.getByTestId("chat-list");
    fireEvent.contextMenu(within(list).getByText("Fix database migration"));
    const menu = await screen.findByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /move to trash/i })
    );

    const toast = await screen.findByTestId("toast");
    expect(within(toast).getByText(/chat deleted/i)).toBeInTheDocument();
    // The Undo action shows its platform-aware keyboard shortcut hint (#179).
    // jsdom reports no macOS platform, so the hint resolves to the Ctrl branch.
    expect(within(toast).getByText("Ctrl+Z")).toBeInTheDocument();

    await user.click(within(toast).getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(
        within(list).getByText("Fix database migration")
      ).toBeInTheDocument();
    });
  });
});

describe("Batch Move to Trash", () => {
  it("trashes the whole Selection and restores it from the Undo toast", async () => {
    const user = userEvent.setup();
    render(<App />);

    const list = screen.getByTestId("chat-list");
    await within(list).findByText("Fix database migration");

    // Mark two chats with Cmd+click on the row body (no checkbox affordance).
    fireEvent.click(
      within(list).getByText("Fix database migration").closest("button")!,
      { metaKey: true }
    );
    fireEvent.click(
      within(list).getByText("Build a login page").closest("button")!,
      { metaKey: true }
    );

    // The batch bar reports the count and offers Move to Trash.
    const bar = await screen.findByTestId("batch-bar");
    expect(bar).toHaveTextContent("2 selected");
    await user.click(
      within(bar).getByRole("button", { name: /Move to Trash/i })
    );

    // Both leave the main list.
    await waitFor(() => {
      expect(
        within(list).queryByText("Fix database migration")
      ).not.toBeInTheDocument();
      expect(
        within(list).queryByText("Build a login page")
      ).not.toBeInTheDocument();
    });

    // Undo restores both; the toast shows the platform-aware hint (#179).
    // jsdom reports no macOS platform, so the hint resolves to the Ctrl branch.
    const toast = await screen.findByTestId("toast");
    expect(within(toast).getByText("Ctrl+Z")).toBeInTheDocument();
    await user.click(within(toast).getByRole("button", { name: /undo/i }));
    await waitFor(() => {
      expect(
        within(list).getByText("Fix database migration")
      ).toBeInTheDocument();
      expect(within(list).getByText("Build a login page")).toBeInTheDocument();
    });
  });

  it("undoes a batch trash with Cmd+Z", async () => {
    const user = userEvent.setup();
    render(<App />);

    const list = screen.getByTestId("chat-list");
    await within(list).findByText("Fix database migration");

    // Two chats so the batch bar (N ≥ 2) appears.
    fireEvent.click(
      within(list).getByText("Fix database migration").closest("button")!,
      { metaKey: true }
    );
    fireEvent.click(
      within(list).getByText("Build a login page").closest("button")!,
      { metaKey: true }
    );
    const bar = await screen.findByTestId("batch-bar");
    await user.click(
      within(bar).getByRole("button", { name: /Move to Trash/i })
    );

    await waitFor(() => {
      expect(
        within(list).queryByText("Fix database migration")
      ).not.toBeInTheDocument();
    });

    await screen.findByTestId("toast");
    await user.keyboard("{Meta>}z{/Meta}");

    await waitFor(() => {
      expect(
        within(list).getByText("Fix database migration")
      ).toBeInTheDocument();
    });
  });
});

describe("Batch Tag (three-state, staged)", () => {
  // Select the two default main-list chats via Cmd+click so the batch bar shows.
  async function selectTwo() {
    const list = screen.getByTestId("chat-list");
    await within(list).findByText("Fix database migration");
    fireEvent.click(
      within(list).getByText("Build a login page").closest("button")!,
      { metaKey: true }
    );
    fireEvent.click(
      within(list).getByText("Fix database migration").closest("button")!,
      { metaKey: true }
    );
    return within(await screen.findByTestId("batch-bar"));
  }

  function optionCheckboxState(tagId: string): string | null {
    // Scope to the dialog — the filter panel also renders data-tag-id rows.
    const dialog = screen.getByTestId("tag-picker-dialog");
    const option = dialog.querySelector(`[data-tag-id="${tagId}"]`)!;
    return option
      .querySelector('[role="checkbox"]')!
      .getAttribute("aria-checked");
  }

  it("opens the batch dialog with tri-state derived across the Selection", async () => {
    const user = userEvent.setup();
    seedTags([
      { id: "tag-bug", name: "bug", color: "red" },
      { id: "tag-idea", name: "idea", color: "violet" },
    ]);
    // bug on both selected chats → all; idea on one → some.
    seedChatTags({
      "chat-1": ["tag-bug", "tag-idea"],
      "chat-2": ["tag-bug"],
    });

    render(<App />);
    const bar = await selectTwo();
    await user.click(bar.getByRole("button", { name: /Add\/Remove Tag/i }));

    await screen.findByTestId("tag-picker-dialog");
    await waitFor(() => {
      expect(optionCheckboxState("tag-bug")).toBe("true");
      expect(optionCheckboxState("tag-idea")).toBe("mixed");
    });
  });

  it("stages a toggle and applies the diff on Done, updating the chips", async () => {
    const user = userEvent.setup();
    seedTags([
      { id: "tag-bug", name: "bug", color: "red" },
      { id: "tag-idea", name: "idea", color: "violet" },
    ]);
    // idea starts on chat-1 only; adding it to the Selection must reach chat-2.
    seedChatTags({ "chat-1": ["tag-bug", "tag-idea"], "chat-2": ["tag-bug"] });

    render(<App />);
    const bar = await selectTwo();
    await user.click(bar.getByRole("button", { name: /Add\/Remove Tag/i }));

    const dialog = await screen.findByTestId("tag-picker-dialog");
    await waitFor(() => expect(optionCheckboxState("tag-idea")).toBe("mixed"));
    // Clicking the mixed row stages add-all; Done applies it in one call.
    await user.click(within(dialog).getByText("idea"));
    await user.click(within(dialog).getByTestId("batch-tag-done"));

    // chat-2 (Fix database migration) now carries the idea chip after reload.
    const list = screen.getByTestId("chat-list");
    await waitFor(() => {
      const row = within(list)
        .getByText("Fix database migration")
        .closest('[data-testid="chat-row"]') as HTMLElement;
      expect(within(row).getByText("idea")).toBeInTheDocument();
    });
    expect(fakeChatTags["chat-2"]).toContain("tag-idea");
  });

  it("raises an Undo toast that replays the inverse diff", async () => {
    const user = userEvent.setup();
    seedTags([
      { id: "tag-bug", name: "bug", color: "red" },
      { id: "tag-idea", name: "idea", color: "violet" },
    ]);
    seedChatTags({ "chat-1": ["tag-bug", "tag-idea"], "chat-2": ["tag-bug"] });

    render(<App />);
    const bar = await selectTwo();
    await user.click(bar.getByRole("button", { name: /Add\/Remove Tag/i }));
    const dialog = await screen.findByTestId("tag-picker-dialog");
    await waitFor(() => expect(optionCheckboxState("tag-idea")).toBe("mixed"));
    await user.click(within(dialog).getByText("idea"));
    await user.click(within(dialog).getByTestId("batch-tag-done"));

    await waitFor(() => expect(fakeChatTags["chat-2"]).toContain("tag-idea"));

    // Undo replays the inverse (remove what the batch added), dropping idea
    // from chat-2. The toast shows the platform-aware hint (#179).
    const toast = await screen.findByTestId("toast");
    expect(within(toast).getByText("Ctrl+Z")).toBeInTheDocument();
    await user.click(within(toast).getByRole("button", { name: /undo/i }));

    await waitFor(() =>
      expect(fakeChatTags["chat-2"]).not.toContain("tag-idea")
    );
  });

  it("applies via Enter (same as Done) without renaming the open chat", async () => {
    const user = userEvent.setup();
    seedTags([
      { id: "tag-bug", name: "bug", color: "red" },
      { id: "tag-idea", name: "idea", color: "violet" },
    ]);
    seedChatTags({ "chat-1": ["tag-bug", "tag-idea"], "chat-2": ["tag-bug"] });

    render(<App />);
    const list = screen.getByTestId("chat-list");
    await within(list).findByText("Build a login page");
    // Open chat-1 (sets the primary/open chat), then extend the Selection to
    // chat-2 — so a stray Enter could otherwise start renaming the open chat.
    await user.click(within(list).getByText("Build a login page"));
    fireEvent.click(
      within(list).getByText("Fix database migration").closest("button")!,
      { metaKey: true }
    );
    const bar = within(await screen.findByTestId("batch-bar"));
    await user.click(bar.getByRole("button", { name: /Add\/Remove Tag/i }));

    const dialog = await screen.findByTestId("tag-picker-dialog");
    await waitFor(() => expect(optionCheckboxState("tag-idea")).toBe("mixed"));
    await user.click(within(dialog).getByText("idea"));
    // Enter applies the staged diff (like clicking Done) and must not leak to
    // the global shortcut that renames the open chat.
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const row = within(list)
        .getByText("Fix database migration")
        .closest('[data-testid="chat-row"]') as HTMLElement;
      expect(within(row).getByText("idea")).toBeInTheDocument();
    });
    // No inline rename input was opened on the chat title.
    expect(
      screen.queryByRole("textbox", { name: /chat title/i })
    ).not.toBeInTheDocument();
  });

  it("drops chats from the list when a batch removes the active Tag filter (via #176 reload)", async () => {
    const user = userEvent.setup();
    seedTags([{ id: "tag-bug", name: "bug", color: "red" }]);
    // Both selectable chats carry bug; a third chat has none.
    seedChatTags({ "chat-1": ["tag-bug"], "chat-2": ["tag-bug"] });

    render(<App />);
    const list = screen.getByTestId("chat-list");
    await within(list).findByText("Build a login page");

    // Activate the bug Tag filter — the list narrows to the two bug chats.
    await user.click(screen.getByTestId("tag-filter-tag-bug"));
    await waitFor(() => {
      expect(
        within(list).queryByText("Refactor utils")
      ).not.toBeInTheDocument();
    });

    const bar = await selectTwo();
    await user.click(bar.getByRole("button", { name: /Add\/Remove Tag/i }));
    const dialog = await screen.findByTestId("tag-picker-dialog");
    await waitFor(() => expect(optionCheckboxState("tag-bug")).toBe("true"));
    // Remove bug from the whole Selection; under the bug filter the reconciling
    // reload must drop them from the list (grow-only refresh would keep them).
    await user.click(within(dialog).getByText("bug"));
    await user.click(within(dialog).getByTestId("batch-tag-done"));

    await waitFor(() => {
      expect(
        within(list).queryByText("Build a login page")
      ).not.toBeInTheDocument();
      expect(
        within(list).queryByText("Fix database migration")
      ).not.toBeInTheDocument();
    });
  });

  it("prunes the Selection to still-visible chats after a filtered removal", async () => {
    const user = userEvent.setup();
    seedTags([{ id: "tag-bug", name: "bug", color: "red" }]);
    seedChatTags({ "chat-1": ["tag-bug"], "chat-2": ["tag-bug"] });

    render(<App />);
    const list = screen.getByTestId("chat-list");
    await within(list).findByText("Build a login page");
    await user.click(screen.getByTestId("tag-filter-tag-bug"));
    await waitFor(() => {
      expect(
        within(list).queryByText("Refactor utils")
      ).not.toBeInTheDocument();
    });

    const bar = await selectTwo();
    await user.click(bar.getByRole("button", { name: /Add\/Remove Tag/i }));
    const dialog = await screen.findByTestId("tag-picker-dialog");
    await waitFor(() => expect(optionCheckboxState("tag-bug")).toBe("true"));
    await user.click(within(dialog).getByText("bug"));
    await user.click(within(dialog).getByTestId("batch-tag-done"));

    // Both chats drop out under the bug filter; the Selection prunes to the
    // ids still visible (none), so the dangling batch bar dismisses itself.
    await waitFor(() => {
      expect(screen.queryByTestId("batch-bar")).not.toBeInTheDocument();
    });
  });
});

describe("Keyboard shortcuts: delete and undo", () => {
  it("deletes the selected session when Backspace is pressed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));

    await user.keyboard("{Backspace}");

    const list = screen.getByTestId("chat-list");
    await waitFor(() => {
      expect(
        within(list).queryByText("Build a login page")
      ).not.toBeInTheDocument();
    });
  });

  it("undoes the last delete when Cmd+Z is pressed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.keyboard("{Backspace}");

    await screen.findByTestId("toast");

    await user.keyboard("{Meta>}z{/Meta}");

    await waitFor(() => {
      expect(screen.getByText("Build a login page")).toBeInTheDocument();
    });
  });
});

describe("Enter Trash mode", () => {
  it("clicking Trash link replaces the session list with deleted sessions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");

    await user.click(screen.getByTestId("trash-link"));

    const list = screen.getByTestId("chat-list");
    expect(within(list).getByText("Old prototype")).toBeInTheDocument();
    expect(
      within(list).queryByText("Build a login page")
    ).not.toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: /back/i })
    ).toBeInTheDocument();
  });
});

describe("Deleted banner in Trash mode", () => {
  it("shows a Deleted banner with a Restore button when viewing a deleted session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    await user.click(screen.getByText("Old prototype"));

    expect(
      await screen.findByText(/this chat is deleted/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^restore$/i })
    ).toBeInTheDocument();
  });
});

describe("Restore from Trash banner", () => {
  it("clicking Restore removes the session from Trash and shows a Restore toast", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));
    await user.click(screen.getByText("Old prototype"));

    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    const list = screen.getByTestId("chat-list");
    await waitFor(() => {
      expect(within(list).queryByText("Old prototype")).not.toBeInTheDocument();
    });

    const toast = await screen.findByTestId("toast");
    expect(within(toast).getByText(/chat restored/i)).toBeInTheDocument();
    expect(
      within(toast).getByRole("button", { name: /view/i })
    ).toBeInTheDocument();
  });

  it("clicking View in the restore toast exits Trash and selects the restored session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));
    await user.click(screen.getByText("Old prototype"));
    await user.click(screen.getByRole("button", { name: /^restore$/i }));

    const toast = await screen.findByTestId("toast");
    await user.click(within(toast).getByRole("button", { name: /view/i }));

    // Back in main mode — Sessions header visible
    const list = screen.getByTestId("chat-list");
    expect(within(list).getByText("Chats")).toBeInTheDocument();

    // Restored session selected and shown in conv header
    const header = screen.getByTestId("conversation-header");
    expect(within(header).getByText("Old prototype")).toBeInTheDocument();
  });
});

describe("Trash mode triggers: hover button, Backspace, Esc", () => {
  it("clicking the hover restore button on a Trash row restores the session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    const list = screen.getByTestId("chat-list");
    const restoreBtn = within(list).getByRole("button", {
      name: /restore: old prototype/i,
    });
    await user.click(restoreBtn);

    await waitFor(() => {
      expect(within(list).queryByText("Old prototype")).not.toBeInTheDocument();
    });
  });

  it("pressing Backspace in Trash mode restores the selected session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));
    await user.click(screen.getByText("Old prototype"));

    await user.keyboard("{Backspace}");

    const list = screen.getByTestId("chat-list");
    await waitFor(() => {
      expect(within(list).queryByText("Old prototype")).not.toBeInTheDocument();
    });
  });

  it("pressing Esc exits Trash mode and returns to the main session list", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    const list = screen.getByTestId("chat-list");
    expect(
      within(list).getByRole("button", { name: /back/i })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(within(list).getByText("Chats")).toBeInTheDocument();
    expect(within(list).getByText("Build a login page")).toBeInTheDocument();
  });
});

describe("Right-click context menu", () => {
  it("right-clicking a session row in main mode shows a Delete item", async () => {
    const user = userEvent.setup();
    render(<App />);

    const row = await screen.findByText("Build a login page");
    fireEvent.contextMenu(row);

    const menu = await screen.findByRole("menu");
    const deleteItem = within(menu).getByRole("menuitem", {
      name: /move to trash/i,
    });

    await user.click(deleteItem);

    const list = screen.getByTestId("chat-list");
    await waitFor(() => {
      expect(
        within(list).queryByText("Build a login page")
      ).not.toBeInTheDocument();
    });
  });

  it("can reopen the context menu after closing it (no stale close-listener)", async () => {
    const user = userEvent.setup();
    render(<App />);

    const row = await screen.findByText("Build a login page");
    fireEvent.contextMenu(row);
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    // Close via outside click.
    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    // Reopen — must not be torn down by a leftover document-level listener.
    fireEvent.contextMenu(row);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("closes the context menu when Escape is pressed", async () => {
    render(<App />);

    const row = await screen.findByText("Build a login page");
    fireEvent.contextMenu(row);
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("right-clicking a Trash row shows a Restore item", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    const row = screen.getByText("Old prototype");
    fireEvent.contextMenu(row);

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /^restore/i })
    ).toBeInTheDocument();
  });
});

describe("Empty states", () => {
  it("shows a Trash empty-state message when no sessions are deleted", async () => {
    server.use(
      http.get("/api/chats", () =>
        HttpResponse.json({
          chats: [
            {
              id: "chat-1",
              sourceId: "CHAT01",
              agent: "claude-code",
              title: "Build a login page",
              project: "/Users/test/my-web-app",
              sourceFilePath: null,
              createdAt: 1700000000000,
              updatedAt: 1700000200000,
            },
          ],
        })
      )
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("trash-link"));

    expect(screen.getByText(/trash is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/deleted chats appear here/i)).toBeInTheDocument();
  });

  it("shows a 'No sessions' hint pointing to Trash when the main list is empty", async () => {
    server.use(
      http.get("/api/chats", () =>
        HttpResponse.json({
          chats: [
            {
              id: "chat-deleted-only",
              sourceId: "CHATDX",
              agent: "claude-code",
              title: "Only deleted",
              project: "/Users/test/p",
              sourceFilePath: null,
              createdAt: 1,
              updatedAt: 2,
              isDeleted: true,
            },
          ],
        })
      )
    );

    render(<App />);

    expect(await screen.findByText(/no chats/i)).toBeInTheDocument();
    // The hint points to Trash without a count (counts were dropped, #129).
    // Scope to the list — the sidebar also has a "Trash" link.
    const list = screen.getByTestId("chat-list");
    expect(
      within(list).getByRole("button", { name: /^trash$/i })
    ).toBeInTheDocument();
  });
});

describe("Three-column layout", () => {
  it("renders filter panel, session list, and conversation panel", async () => {
    render(<App />);

    await screen.findByText("Build a login page");

    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-list")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-panel")).toBeInTheDocument();
  });
});

describe("Error handling", () => {
  it("shows error message instead of crashing when session has no conversation file", async () => {
    const user = userEvent.setup();
    render(<App />);

    const sessionButton = await screen.findByText("Untitled");
    await user.click(sessionButton);

    expect(await screen.findByText(/chat not found/i)).toBeInTheDocument();

    // App should still be functional — no white screen
    expect(screen.getByTestId("chat-list")).toBeInTheDocument();
  });
});

describe("Conversation view", () => {
  it("displays messages after clicking a session", async () => {
    const user = userEvent.setup();
    render(<App />);

    const sessionButton = await screen.findByText("Build a login page");
    await user.click(sessionButton);

    expect(
      await screen.findByText("Help me build a login page")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sure, I'll create a login page.")
    ).toBeInTheDocument();
  });

  it("visually distinguishes user and assistant messages", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await screen.findByText("Help me build a login page");

    const userMessage = screen
      .getByText("Help me build a login page")
      .closest("[data-role]");
    const assistantMessage = screen
      .getByText("Sure, I'll create a login page.")
      .closest("[data-role]");

    expect(userMessage).toHaveAttribute("data-role", "user");
    expect(assistantMessage).toHaveAttribute("data-role", "assistant");
  });

  it("renders markdown formatting in message content", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Fix database migration"));

    // User message has bold text and a link
    const boldEl = await screen.findByText("bold");
    expect(boldEl.tagName).toBe("STRONG");

    const linkEl = screen.getByText("link");
    expect(linkEl.tagName).toBe("A");
    expect(linkEl).toHaveAttribute("href", "https://example.com");

    // Assistant message has a syntax-highlighted code block
    // rehype-highlight splits tokens into spans, so use a function matcher
    const codeBlock = screen.getByText((_content, element) => {
      return (
        element?.tagName === "CODE" &&
        element.textContent?.includes("console.log('hello')") === true
      );
    });
    expect(codeBlock.className).toMatch(/hljs/);
  });
});

describe("Tool call rendering", () => {
  it("shows a collapsed summary for tool_use blocks", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));

    // Tool call summary should be visible
    expect(await screen.findByText("Read: src/utils.ts")).toBeInTheDocument();

    // Full tool input should NOT be visible when collapsed
    expect(screen.queryByText(/"file_path"/)).not.toBeInTheDocument();
  });

  it("expands tool call to show full input when clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));
    const summary = await screen.findByText("Read: src/utils.ts");

    // Click to expand
    await user.click(summary);

    // Should show the tool input details
    expect(screen.getByText(/"file_path"/)).toBeInTheDocument();
  });

  it("collapses tool call back when clicked again", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));
    const summary = await screen.findByText("Read: src/utils.ts");

    // Expand then collapse
    await user.click(summary);
    expect(screen.getByText(/"file_path"/)).toBeInTheDocument();

    await user.click(summary);
    expect(screen.queryByText(/"file_path"/)).not.toBeInTheDocument();
  });
});

describe("Thinking block rendering", () => {
  it("does not render thinking blocks with empty content", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));
    await screen.findByText("Read: src/utils.ts");

    // session-3 has one empty thinking and one with content
    // Only one "Thinking..." button should appear
    const thinkingButtons = screen.getAllByText("Thinking...");
    expect(thinkingButtons).toHaveLength(1);
  });

  it("shows a collapsed 'Thinking...' label by default", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));

    // Should show collapsed thinking label
    expect(await screen.findByText("Thinking...")).toBeInTheDocument();

    // Full thinking content should NOT be visible when collapsed
    expect(
      screen.queryByText(/read the current utils file/)
    ).not.toBeInTheDocument();
  });

  it("expands thinking block to show full content when clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));
    const thinkingLabel = await screen.findByText("Thinking...");

    await user.click(thinkingLabel);

    expect(screen.getByText(/read the current utils file/)).toBeInTheDocument();
  });

  it("collapses thinking block back when clicked again", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));
    const thinkingLabel = await screen.findByText("Thinking...");

    await user.click(thinkingLabel);
    expect(screen.getByText(/read the current utils file/)).toBeInTheDocument();

    await user.click(thinkingLabel);
    expect(
      screen.queryByText(/read the current utils file/)
    ).not.toBeInTheDocument();
  });
});

describe("Custom chat titles — inline edit", () => {
  it("clicking the title in the conversation header enters edit mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));

    const header = screen.getByTestId("conversation-header");
    await user.click(within(header).getByText("Build a login page"));

    const input = within(header).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("Build a login page");
  });

  it("saving via Enter updates both header and list row immediately", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));

    const header = screen.getByTestId("conversation-header");
    await user.click(within(header).getByText("Build a login page"));
    const input = within(header).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My favourite chat" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(within(header).getByText("My favourite chat")).toBeInTheDocument();
    });
    const list = screen.getByTestId("chat-list");
    expect(within(list).getByText("My favourite chat")).toBeInTheDocument();
    expect(
      within(list).queryByText("Build a login page")
    ).not.toBeInTheDocument();
  });

  it("pressing Escape cancels the edit and keeps the original title", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));

    const header = screen.getByTestId("conversation-header");
    await user.click(within(header).getByText("Build a login page"));
    const input = within(header).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Discard me" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(within(header).getByText("Build a login page")).toBeInTheDocument();
    expect(within(header).queryByText("Discard me")).not.toBeInTheDocument();
  });

  it("clearing a custom title reverts to the default derived title", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    const header = screen.getByTestId("conversation-header");

    await user.click(within(header).getByText("Build a login page"));
    let input = within(header).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Temporary" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(within(header).getByText("Temporary")).toBeInTheDocument()
    );

    await user.click(within(header).getByText("Temporary"));
    input = within(header).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        within(header).getByText("Build a login page")
      ).toBeInTheDocument();
    });
  });

  it("clicking the title of an already-selected list row enters edit mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    const list = await screen.findByTestId("chat-list");
    // First click selects the session. The virtualized list mounts its rows a
    // tick after the container, so wait for the row before clicking.
    await user.click(await within(list).findByText("Fix database migration"));
    // Second click on the title of the already-selected row enters edit
    await user.click(within(list).getByText("Fix database migration"));

    const input = within(list).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Migrate me" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(within(list).getByText("Migrate me")).toBeInTheDocument();
    });
    expect(
      within(list).queryByText("Fix database migration")
    ).not.toBeInTheDocument();
  });

  it("right-click Rename on a session row enters edit mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    const list = screen.getByTestId("chat-list");
    fireEvent.contextMenu(within(list).getByText("Fix database migration"));

    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /rename/i }));

    const input = within(list).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Renamed via menu" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(within(list).getByText("Renamed via menu")).toBeInTheDocument();
    });
  });

  it("pressing F2 on a selected session enters edit mode in the list row", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.keyboard("{F2}");

    const list = screen.getByTestId("chat-list");
    const input = within(list).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("Build a login page");
  });
});

describe("Tool call rendering (continued)", () => {
  it("does not render tool_result blocks", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Refactor utils"));
    await screen.findByText("Read: src/utils.ts");

    // tool_result content should not appear
    expect(
      screen.queryByText("export function add(a, b) { return a + b; }")
    ).not.toBeInTheDocument();
  });
});

describe("Freeze sort order on background updates", () => {
  type WireChat = {
    id: string;
    sourceId: string;
    agent: string;
    title: string;
    project: string;
    projectPath: string | null;
    sourceFilePath: string | null;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number | null;
    isDeleted?: boolean;
  };

  // The active (non-deleted) chats in their default Updated-time-desc order:
  // Fix database migration, Build a login page, Refactor utils, Untitled.
  function activeChats(): WireChat[] {
    return [
      {
        id: "chat-2",
        sourceId: "CHAT02",
        agent: "claude-code",
        title: "Fix database migration",
        project: "backend-api",
        projectPath: "/Users/test/backend-api",
        sourceFilePath: null,
        createdAt: 1700000100000,
        updatedAt: 1700000300000,
      },
      {
        id: "chat-1",
        sourceId: "CHAT01",
        agent: "claude-code",
        title: "Build a login page",
        project: "my-web-app",
        projectPath: "/Users/test/my-web-app",
        sourceFilePath: null,
        createdAt: 1700000000000,
        updatedAt: 1700000200000,
      },
      {
        id: "chat-3",
        sourceId: "CHAT03",
        agent: "claude-code",
        title: "Refactor utils",
        project: "my-web-app",
        projectPath: "/Users/test/my-web-app",
        sourceFilePath: null,
        createdAt: 1700000050000,
        updatedAt: 1700000150000,
      },
      {
        id: "chat-missing",
        sourceId: "CHATMI",
        agent: "claude-code",
        title: "Untitled",
        project: "some-project",
        projectPath: "/Users/test/some-project",
        sourceFilePath: null,
        createdAt: 1699999900000,
        updatedAt: 1699999900000,
      },
    ];
  }

  // The deleted chats, kept stable so the Trash view stays populated across a
  // simulated background ingest.
  function trashedChats(): WireChat[] {
    return [
      {
        id: "chat-deleted-1",
        sourceId: "CHATDE",
        agent: "claude-code",
        title: "Old prototype",
        project: "my-web-app",
        projectPath: "/Users/test/my-web-app",
        sourceFilePath: null,
        createdAt: 1699999000000,
        updatedAt: 1699999500000,
        deletedAt: 1700000200000,
        isDeleted: true,
      },
      {
        id: "chat-deleted-2",
        sourceId: "CHATD2",
        agent: "claude-code",
        title: "Newer experiment",
        project: "my-web-app",
        projectPath: "/Users/test/my-web-app",
        sourceFilePath: null,
        createdAt: 1699999100000,
        updatedAt: 1699999800000,
        deletedAt: 1700000100000,
        isDeleted: true,
      },
    ];
  }

  // Serve a given active list (plus the stable deleted chats) on every
  // subsequent /api/chats read — i.e. the next background reconcile.
  function serveBackground(active: WireChat[]): void {
    const chats = [...active, ...trashedChats()];
    server.use(http.get("/api/chats", () => HttpResponse.json({ chats })));
  }

  // Live updates are a server push now (#132); jsdom has no EventSource, so the
  // push connector is inert here. Drive the window's reconcile through its
  // low-frequency safety floor instead: advance past the floor interval and let
  // the refetch settle. The frozen-order behavior under test is the same whether
  // the reconcile is push- or floor-triggered.
  async function flushBackgroundReconcile(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31000);
    });
  }

  it("keeps the selected row in place when a background refresh bumps its updatedAt", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      render(<App />);

      // Select "Build a login page" (chat-1), which sits at row index 1.
      await user.click(await screen.findByText("Build a login page"));

      const list = screen.getByTestId("chat-list");
      let rows = within(list).getAllByTestId("chat-row");
      expect(rows[0].textContent).toContain("Fix database migration");
      expect(rows[1].textContent).toContain("Build a login page");

      // Background ingest: chat-1 now has the newest updatedAt. A live re-sort
      // would float it to the top.
      const bumped = activeChats();
      bumped[1].updatedAt = 1700000999000;
      serveBackground(bumped);

      await flushBackgroundReconcile();

      // Frozen: the selected row has not moved.
      rows = within(list).getAllByTestId("chat-row");
      expect(rows[0].textContent).toContain("Fix database migration");
      expect(rows[1].textContent).toContain("Build a login page");
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the held-back order on the next sort change", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      render(<App />);
      await user.click(await screen.findByText("Build a login page"));
      const list = screen.getByTestId("chat-list");

      // Background ingest floats chat-1 to newest; the order stays frozen.
      const bumped = activeChats();
      bumped[1].updatedAt = 1700000999000;
      serveBackground(bumped);
      await flushBackgroundReconcile();
      let rows = within(list).getAllByTestId("chat-row");
      expect(rows[1].textContent).toContain("Build a login page");

      // Re-clicking the active Updated-time axis flips to Oldest first and
      // re-sorts with the background data: chat-1 (now newest) sinks to bottom.
      await user.click(within(list).getByRole("button", { name: /sort/i }));
      const popover = await screen.findByTestId("chat-sort-popover");
      await user.click(within(popover).getByText("Updated time"));

      rows = within(list).getAllByTestId("chat-row");
      expect(rows[0].textContent).toContain("Untitled");
      expect(rows[3].textContent).toContain("Build a login page");
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the held-back order after switching views and back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      render(<App />);
      await user.click(await screen.findByText("Build a login page"));
      const list = screen.getByTestId("chat-list");

      const bumped = activeChats();
      bumped[1].updatedAt = 1700000999000;
      serveBackground(bumped);
      await flushBackgroundReconcile();
      const rows = within(list).getAllByTestId("chat-row");
      expect(rows[1].textContent).toContain("Build a login page");

      // Switch to Trash and back: the view switch flushes the frozen order.
      await user.click(screen.getByTestId("trash-link"));
      await screen.findByText("Old prototype");
      await user.keyboard("{Escape}");

      await waitFor(() => {
        const r = within(screen.getByTestId("chat-list")).getAllByTestId(
          "chat-row"
        );
        expect(r[0].textContent).toContain("Build a login page");
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("inserts a newly-appearing chat at its sorted position while holding the rest", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<App />);
      // No selection, so "Build a login page" appears only in the list.
      await screen.findByText("Build a login page");
      const list = screen.getByTestId("chat-list");

      // A background ingest adds a brand-new chat whose updatedAt (1700000250000)
      // places it between chat-2 (1700000300000) and chat-1 (1700000200000). No
      // existing chat's time changes, so the held order is otherwise untouched.
      const withNew = activeChats();
      withNew.push({
        id: "chat-new",
        sourceId: "CHATNW",
        agent: "claude-code",
        title: "Fresh ingest",
        project: "my-web-app",
        projectPath: "/Users/test/my-web-app",
        sourceFilePath: null,
        createdAt: 1700000250000,
        updatedAt: 1700000250000,
      });
      serveBackground(withNew);
      await flushBackgroundReconcile();

      const rows = within(list).getAllByTestId("chat-row");
      // Existing chats keep their frozen relative order; the new chat slots into
      // its sorted position between chat-2 and chat-1.
      expect(rows[0].textContent).toContain("Fix database migration");
      expect(rows[1].textContent).toContain("Fresh ingest");
      expect(rows[2].textContent).toContain("Build a login page");
      expect(rows[3].textContent).toContain("Refactor utils");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-sorts immediately when the user renames a chat", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Build a login page");
    const list = screen.getByTestId("chat-list");

    // Sort by Title (A-Z) so a rename visibly changes order.
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Title"));
    await user.keyboard("{Escape}");

    let rows = within(list).getAllByTestId("chat-row");
    expect(rows[0].textContent).toContain("Build a login page");

    // Rename it to sort last; the list re-sorts immediately (a user action).
    await user.click(within(list).getByText("Build a login page"));
    await user.click(within(list).getByText("Build a login page"));
    const input = within(list).getByRole("textbox", {
      name: /chat title/i,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Zzz renamed last" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(within(list).getByText("Zzz renamed last")).toBeInTheDocument();
    });
    rows = within(list).getAllByTestId("chat-row");
    expect(rows[rows.length - 1].textContent).toContain("Zzz renamed last");
  });
});

describe("Project filter", () => {
  it("filters the chat list to the clicked Project", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("project-row-backend-api"));

    const list = screen.getByTestId("chat-list");
    await waitFor(() => {
      expect(
        within(list).queryByText("Build a login page")
      ).not.toBeInTheDocument();
    });
    expect(
      within(list).getByText("Fix database migration")
    ).toBeInTheDocument();
  });

  it("shows the server's filtered List count in the header when a filter is active", async () => {
    // The header total must come from the server's filtered-total endpoint, not
    // the loaded window — at scale the paginated window is smaller than the
    // filtered set (#131 Phase B). Override the endpoint to a sentinel the window
    // could never produce, proving the header reads it.
    server.use(
      http.get("/api/chats/list-total", () => HttpResponse.json({ total: 42 }))
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    // Unfiltered: the header shows the server facet total (4 active chats).
    expect(screen.getByTestId("chat-list-count")).toHaveTextContent("4");

    await user.click(screen.getByTestId("project-row-backend-api"));

    await waitFor(() => {
      expect(screen.getByTestId("chat-list-count")).toHaveTextContent("42");
    });
  });

  it("unions chats across several selected Projects (OR)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    await user.click(screen.getByTestId("project-row-my-web-app"));
    await user.click(screen.getByTestId("project-row-backend-api"));

    const list = screen.getByTestId("chat-list");
    expect(within(list).getByText("Build a login page")).toBeInTheDocument();
    expect(
      within(list).getByText("Fix database migration")
    ).toBeInTheDocument();
    // some-project's chat ("Untitled") is in neither selected project.
    await waitFor(() => {
      expect(within(list).queryByText("Untitled")).not.toBeInTheDocument();
    });
  });

  it("marks the selected Project row as pressed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    const row = screen.getByTestId("project-row-backend-api");
    expect(row).toHaveAttribute("aria-pressed", "false");
    await user.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a 'filters active' summary and Clear restores the full list", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    // No filter active: the summary bar is hidden.
    expect(screen.queryByTestId("filters-summary")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("project-row-backend-api"));

    const summary = screen.getByTestId("filters-summary");
    expect(summary).toHaveTextContent("1 filter active");

    const list = screen.getByTestId("chat-list");
    await waitFor(() => {
      expect(
        within(list).queryByText("Build a login page")
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByTestId("filters-clear"));
    expect(
      await within(list).findByText("Build a login page")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("filters-summary")).not.toBeInTheDocument();
  });

  it("derives Project counts from the active view (main vs Trash)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Build a login page");
    // Main view: backend-api has one active chat.
    expect(screen.getByTestId("project-row-backend-api")).toBeInTheDocument();

    await user.click(screen.getByTestId("trash-link"));

    const section = await screen.findByTestId("projects-section");
    // Trash has no backend-api chats, so its row is gone; my-web-app has two.
    expect(
      within(section).queryByTestId("project-row-backend-api")
    ).not.toBeInTheDocument();
    const webRow = within(section).getByTestId("project-row-my-web-app");
    expect(within(webRow).getByText("2")).toBeInTheDocument();
  });
});

describe("Chat list pagination", () => {
  // Capture the search string of every /api/chats GET, so a test can tell the
  // paginated path (`?...limit=`) apart from the full-load path (no `limit`).
  function captureChatListRequests(): string[] {
    const searches: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/chats") {
        searches.push(url.search);
      }
    });
    return searches;
  }

  it("loads the main chat list via the paginated keyset endpoint", async () => {
    const searches = captureChatListRequests();
    render(<App />);

    await screen.findByText("Fix database migration");

    // Default sort is Updated time · Newest first — a paginated time axis, so
    // the main list is fetched as keyset pages (`limit` present) rather than the
    // full list.
    expect(searches.some((s) => s.includes("limit="))).toBe(true);
    expect(searches.some((s) => s.includes("sort=updatedAt"))).toBe(true);
    // The full-load path (no `limit`) is not used for the main view.
    expect(searches.every((s) => s.includes("limit="))).toBe(true);

    // Rows still render in Updated-time descending order.
    const list = screen.getByTestId("chat-list");
    const titles = within(list)
      .getAllByTestId("chat-row")
      .map((r) => r.textContent);
    expect(titles[0]).toContain("Fix database migration");
    expect(titles[1]).toContain("Build a login page");
  });

  it("paginates the Title axis with sort=title, not a full load (#146)", async () => {
    const user = userEvent.setup();
    const searches = captureChatListRequests();
    render(<App />);
    await screen.findByText("Build a login page");

    const list = screen.getByTestId("chat-list");
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Title"));

    // Title is now a keyset axis (#146 / ADR-0019): selecting it pages
    // server-side with sort=title rather than pulling the full list.
    await waitFor(() =>
      expect(
        searches.some((s) => s.includes("sort=title") && s.includes("limit="))
      ).toBe(true)
    );
    // The full-load path (no `limit`) is gone — no request ever drops `limit`.
    expect(searches.every((s) => s.includes("limit="))).toBe(true);

    const titles = within(list)
      .getAllByTestId("chat-row")
      .map((r) => r.textContent);
    expect(titles[0]).toContain("Build a login page");
  });

  it("paginates an ascending time axis with direction=asc, not a full load", async () => {
    const user = userEvent.setup();
    const searches = captureChatListRequests();
    render(<App />);
    await screen.findByText("Build a login page");

    const list = screen.getByTestId("chat-list");
    // Default is Updated time · Newest first. Clicking the active axis again
    // flips it to ascending (Oldest first). The covering keyset index scans
    // either way (#143), so the list keeps paging server-side with
    // direction=asc instead of falling back to the full list.
    await user.click(within(list).getByRole("button", { name: /sort/i }));
    const popover = await screen.findByTestId("chat-sort-popover");
    await user.click(within(popover).getByText("Updated time"));

    await waitFor(() =>
      expect(
        searches.some(
          (s) => s.includes("direction=asc") && s.includes("limit=")
        )
      ).toBe(true)
    );
    // No request ever drops `limit` — the ascending axis never pulls the full
    // list (the fallback this slice removes).
    expect(searches.every((s) => s.includes("limit="))).toBe(true);
  });

  it("uses the keyset paginated path for the Trash view (#145)", async () => {
    const user = userEvent.setup();
    const searches = captureChatListRequests();
    render(<App />);
    await screen.findByText("Build a login page");

    await user.click(screen.getByTestId("trash-link"));

    // Trash no longer pulls the full list (ADR-0018): it pages server-side,
    // trashed-only, defaulting to the deleted-time axis (#145). Its deleted
    // chats load through the keyset endpoint.
    const list = screen.getByTestId("chat-list");
    expect(await within(list).findByText("Old prototype")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        searches.some(
          (s) =>
            s.includes("limit=") &&
            s.includes("trashedOnly=true") &&
            s.includes("sort=deletedAt")
        )
      ).toBe(true)
    );
  });
});
