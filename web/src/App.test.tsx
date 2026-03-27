import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("Session list", () => {
  it("displays session titles fetched from the API", async () => {
    render(<App />);

    expect(await screen.findByText("Build a login page")).toBeInTheDocument();
    expect(screen.getByText("Fix database migration")).toBeInTheDocument();
  });

  it("sorts sessions by updatedAt descending (most recent first)", async () => {
    render(<App />);

    await screen.findByText("Fix database migration");

    const listItems = screen.getAllByRole("button");
    const titles = listItems.map((item) => item.textContent);

    // session-2 has updatedAt 1700000300000 (newer)
    // session-1 has updatedAt 1700000200000 (older)
    expect(titles[0]).toContain("Fix database migration");
    expect(titles[1]).toContain("Build a login page");
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
});
