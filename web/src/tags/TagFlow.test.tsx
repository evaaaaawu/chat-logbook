import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import App from "@/App";

// End-to-end wiring of the find-or-create popover against the MSW tag handlers:
// create a tag inline, see it become a chip in the tag strip and a dot in the
// list.
describe("Tag assignment flow", () => {
  it("creates a tag from the popover and shows it as a chip and a list dot", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Open a chat so the conversation header and tag strip render.
    await user.click(await screen.findByText("Build a login page"));

    await user.click(await screen.findByTestId("add-tag-button"));
    await user.type(
      await screen.findByLabelText("Find or create a tag"),
      "bug"
    );
    await user.click(await screen.findByTestId("create-tag-button"));

    // Chip appears in the tag strip below the header.
    const strip = screen.getByTestId("tag-strip");
    await waitFor(() => {
      expect(within(strip).getByTestId("tag-chip")).toHaveTextContent("bug");
    });

    // The new tag is in the management section of the navigation panel.
    expect(
      within(screen.getByTestId("tags-section")).getByText("bug")
    ).toBeInTheDocument();

    // And the chat list row shows the tag as a name chip on its third line.
    await waitFor(() => {
      expect(
        within(screen.getByTestId("chat-list")).getAllByTestId("tag-chip-list")
          .length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("creates a tag with an overridden color via Enter after clicking a swatch", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.click(await screen.findByTestId("add-tag-button"));
    await user.type(
      await screen.findByLabelText("Find or create a tag"),
      "design"
    );

    // Override the auto-picked color, which moves focus onto the swatch button.
    await user.click(screen.getByLabelText("Color blue"));
    // Enter must still create the tag — not start a chat-title rename.
    await user.keyboard("{Enter}");

    const strip = screen.getByTestId("tag-strip");
    await waitFor(() => {
      expect(within(strip).getByTestId("tag-chip")).toHaveTextContent("design");
    });
    // The chat title must not have entered rename mode.
    expect(
      within(screen.getByTestId("conversation-header")).queryByLabelText(
        "Chat title"
      )
    ).not.toBeInTheDocument();
  });

  it("removes an assigned tag from the strip chip", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Build a login page"));
    await user.click(await screen.findByTestId("add-tag-button"));
    await user.type(
      await screen.findByLabelText("Find or create a tag"),
      "bug"
    );
    await user.click(await screen.findByTestId("create-tag-button"));

    const strip = screen.getByTestId("tag-strip");
    await waitFor(() =>
      expect(within(strip).getByTestId("tag-chip")).toBeInTheDocument()
    );

    await user.click(within(strip).getByLabelText("Remove tag bug"));

    await waitFor(() =>
      expect(within(strip).queryByTestId("tag-chip")).not.toBeInTheDocument()
    );
  });
});
