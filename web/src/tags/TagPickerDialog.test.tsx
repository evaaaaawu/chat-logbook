import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Tag } from "@/types";
import { TagPickerDialog } from "@/tags/TagPickerDialog";

const TAGS: Tag[] = [
  { id: "t1", name: "bug", color: "red" },
  { id: "t2", name: "design", color: "blue" },
];

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof TagPickerDialog>> = {}
) {
  const props = {
    title: "Add tags",
    tags: TAGS,
    stateFor: () => "none" as const,
    onToggle: vi.fn(),
    onCreate: vi.fn(async () => null),
    ...overrides,
  };
  render(<TagPickerDialog {...props} />);
  return props;
}

describe("TagPickerDialog", () => {
  it("opens a centered dialog listing each tag as a row with its name", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Add tags");
    expect(within(dialog).getByText("bug")).toBeInTheDocument();
    expect(within(dialog).getByText("design")).toBeInTheDocument();
  });

  it("renders a dimming scrim overlay and closes on outside click", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));
    await screen.findByRole("dialog");

    // A scrim dims the page behind the modal and catches outside clicks.
    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]');
    expect(backdrop).not.toBeNull();
    expect(backdrop).toHaveClass("bg-black/50");

    await user.click(backdrop as Element);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reflects stateFor on each row's tri-state checkbox", async () => {
    const user = userEvent.setup();
    renderPicker({
      stateFor: (id) => (id === "t1" ? "all" : id === "t2" ? "some" : "none"),
      tags: [
        { id: "t1", name: "bug", color: "red" },
        { id: "t2", name: "design", color: "blue" },
        { id: "t3", name: "wip", color: "green" },
      ],
    });

    await user.click(screen.getByTestId("add-tag-button"));
    const dialog = await screen.findByRole("dialog");

    const rowFor = (name: string) =>
      within(dialog).getByText(name).closest("[data-tag-id]") as HTMLElement;
    const checkbox = (name: string) =>
      within(rowFor(name)).getByRole("checkbox");

    expect(checkbox("bug")).toBeChecked();
    expect(checkbox("wip")).not.toBeChecked();
    expect(checkbox("design")).toHaveAttribute("aria-checked", "mixed");
  });

  it("calls onToggle with the tag id when a row is clicked", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("bug"));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("t1");
  });

  it("finds by filtering and creates a new tag with the name-derived color", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));

    // Typing an existing name filters the list and offers no create.
    await user.type(screen.getByLabelText("Find or create a tag"), "bug");
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.queryByText("design")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-tag-button")).not.toBeInTheDocument();

    // Typing a brand-new name offers create; clicking it calls onCreate.
    await user.clear(screen.getByLabelText("Find or create a tag"));
    await user.type(screen.getByLabelText("Find or create a tag"), "urgent");
    await user.click(screen.getByTestId("create-tag-button"));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("urgent", expect.any(String));
  });

  it("creates with an overridden color via Enter after clicking a swatch", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));
    await user.type(screen.getByLabelText("Find or create a tag"), "urgent");

    // Override the auto-picked color, which moves focus onto the swatch button.
    await user.click(screen.getByLabelText("Color blue"));
    // Enter must still create the tag from the input.
    await user.keyboard("{Enter}");

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("urgent", "blue");
  });

  it("closes on the Done button in single mode", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Enter in single mode without submitting a create", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderPicker();

    await user.click(screen.getByTestId("add-tag-button"));
    await screen.findByRole("dialog");

    // Enter with no create pending acts as Done and closes the dialog.
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
