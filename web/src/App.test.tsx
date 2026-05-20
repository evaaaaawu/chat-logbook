import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, it, expect } from "vitest";
import App from "./App";
import { server } from "./test/server";

describe("Chat list", () => {
  it("displays session titles fetched from the API", async () => {
    render(<App />);

    expect(await screen.findByText("Build a login page")).toBeInTheDocument();
    expect(screen.getByText("Fix database migration")).toBeInTheDocument();
  });

  it("displays project name and relative time for each session", async () => {
    render(<App />);

    await screen.findByText("Build a login page");

    // Project name: last segment of path
    expect(screen.getAllByText("my-web-app").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("backend-api")).toBeInTheDocument();
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

describe("Trash link in filter panel", () => {
  it("shows the count of deleted sessions in a Trash link", async () => {
    render(<App />);

    await screen.findByText("Build a login page");

    const trashLink = await screen.findByTestId("trash-link");
    expect(within(trashLink).getByText(/trash/i)).toBeInTheDocument();
    expect(within(trashLink).getByText("1")).toBeInTheDocument();
  });
});

describe("Soft delete from chat list", () => {
  it("removes the session from the list and increments trash count", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Fix database migration");

    // Find the session row by title, then its delete button
    const row = screen.getByText("Fix database migration").closest("button");
    if (!row) throw new Error("Chat row not found");

    const deleteButton = within(row.parentElement!).getByRole("button", {
      name: /move to trash: fix database migration/i,
    });
    await user.click(deleteButton);

    // Session should disappear from main list
    await waitFor(() => {
      expect(
        screen.queryByText("Fix database migration")
      ).not.toBeInTheDocument();
    });

    // Trash count: 1 → 2
    const trashLink = screen.getByTestId("trash-link");
    expect(within(trashLink).getByText("2")).toBeInTheDocument();
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

    // Delete it via hover button
    const list = screen.getByTestId("chat-list");
    const deleteBtn = within(list).getByRole("button", {
      name: /move to trash: build a login page/i,
    });
    await user.click(deleteBtn);

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

    const list = screen.getByTestId("chat-list");
    const deleteBtn = within(list).getByRole("button", {
      name: /move to trash: fix database migration/i,
    });
    await user.click(deleteBtn);

    const toast = await screen.findByTestId("toast");
    expect(within(toast).getByText(/chat deleted/i)).toBeInTheDocument();

    await user.click(within(toast).getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(
        within(list).getByText("Fix database migration")
      ).toBeInTheDocument();
    });

    const trashLink = screen.getByTestId("trash-link");
    expect(within(trashLink).getByText("1")).toBeInTheDocument();
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
    expect(within(list).getByText(/trash \(1\)/i)).toBeInTheDocument();
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
    expect(within(list).getByText(/trash/i)).toBeInTheDocument();

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
              title: "Build a login page",
              project: "/Users/test/my-web-app",
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
              title: "Only deleted",
              project: "/Users/test/p",
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
    expect(
      screen.getByRole("button", { name: /^trash \(1\)$/i })
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
    // First click selects the session
    await user.click(within(list).getByText("Fix database migration"));
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
