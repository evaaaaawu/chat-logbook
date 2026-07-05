import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TagsSection } from "./TagsSection";
import { UNTAGGED } from "./untagged";
import type { Tag } from "@/types";

const TAGS: Tag[] = [
  { id: "t-bug", name: "bug", color: "violet" },
  { id: "t-idea", name: "idea", color: "blue" },
];

function renderSection(
  overrides: Partial<React.ComponentProps<typeof TagsSection>> = {}
) {
  const props: React.ComponentProps<typeof TagsSection> = {
    tags: TAGS,
    countForTag: () => 1,
    untaggedCount: 3,
    selected: new Set<string>(),
    tagMode: "all",
    onTagModeChange: vi.fn(),
    onToggle: vi.fn(),
    onRename: vi.fn(),
    onRecolor: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<TagsSection {...props} />);
  return props;
}

describe("TagsSection — Match All/Any control", () => {
  it("renders a Match control reflecting the active mode", () => {
    renderSection({ tagMode: "any" });

    expect(screen.getByTestId("tag-match-all")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByTestId("tag-match-any")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("calls onTagModeChange when a mode is picked", async () => {
    const user = userEvent.setup();
    const props = renderSection({ tagMode: "all" });

    await user.click(screen.getByTestId("tag-match-any"));

    expect(props.onTagModeChange).toHaveBeenCalledWith("any");
  });
});

describe("TagsSection — Untagged dimming by mode", () => {
  it("dims real Tag rows while Untagged is active in All mode", () => {
    renderSection({ tagMode: "all", selected: new Set([UNTAGGED]) });

    const row = document.querySelector('[data-tag-id="t-bug"]');
    expect(row).toHaveAttribute("data-dimmed", "true");
  });

  it("does not dim real Tag rows in Any mode (Untagged joins the union)", () => {
    renderSection({ tagMode: "any", selected: new Set([UNTAGGED]) });

    const row = document.querySelector('[data-tag-id="t-bug"]');
    expect(row).not.toHaveAttribute("data-dimmed", "true");
  });
});
