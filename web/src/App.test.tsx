import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("Session list", () => {
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

    const list = screen.getByTestId("session-list");
    const rowButtons = within(list)
      .getAllByRole("button")
      .filter((el) => !el.getAttribute("aria-label")?.startsWith("Delete"));
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

describe("Soft delete from session list", () => {
  it("removes the session from the list and increments trash count", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Fix database migration");

    // Find the session row by title, then its delete button
    const row = screen.getByText("Fix database migration").closest("button");
    if (!row) throw new Error("Session row not found");

    const deleteButton = within(row.parentElement!).getByRole("button", {
      name: /delete session: fix database migration/i,
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
    const list = screen.getByTestId("session-list");
    const deleteBtn = within(list).getByRole("button", {
      name: /delete session: build a login page/i,
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

    const list = screen.getByTestId("session-list");
    const deleteBtn = within(list).getByRole("button", {
      name: /delete session: fix database migration/i,
    });
    await user.click(deleteBtn);

    const toast = await screen.findByTestId("toast");
    expect(within(toast).getByText(/session deleted/i)).toBeInTheDocument();

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

    const list = screen.getByTestId("session-list");
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

describe("Three-column layout", () => {
  it("renders filter panel, session list, and conversation panel", async () => {
    render(<App />);

    await screen.findByText("Build a login page");

    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();
    expect(screen.getByTestId("session-list")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-panel")).toBeInTheDocument();
  });
});

describe("Error handling", () => {
  it("shows error message instead of crashing when session has no conversation file", async () => {
    const user = userEvent.setup();
    render(<App />);

    const sessionButton = await screen.findByText("Untitled");
    await user.click(sessionButton);

    expect(await screen.findByText(/session not found/i)).toBeInTheDocument();

    // App should still be functional — no white screen
    expect(screen.getByTestId("session-list")).toBeInTheDocument();
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
