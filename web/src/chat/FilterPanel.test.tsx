import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterPanel } from "./FilterPanel";

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof FilterPanel>> = {}
) {
  const props: React.ComponentProps<typeof FilterPanel> = {
    deletedCount: 0,
    onOpenTrash: vi.fn(),
    projectFacets: [],
    selectedProjects: new Set<string>(),
    onToggleProject: vi.fn(),
    onClearFilters: vi.fn(),
    tags: [],
    countForTag: () => 0,
    untaggedCount: 0,
    selectedTags: new Set<string>(),
    tagMode: "all",
    onTagModeChange: vi.fn(),
    onToggleTag: vi.fn(),
    onRenameTag: vi.fn(),
    onRecolorTag: vi.fn(),
    onDeleteTag: vi.fn(),
    ...overrides,
  };
  render(<FilterPanel {...props} />);
  return props;
}

describe("FilterPanel — brand mark", () => {
  it("shows the logbook mark referencing the favicon asset, not a plain square", () => {
    renderPanel();

    const mark = screen.getByTestId("brand-mark");
    expect(mark.tagName).toBe("IMG");
    expect(mark.getAttribute("src")).toBe("/favicon.svg");
  });

  it("renders the mark as a square in the sidebar header", () => {
    renderPanel();

    const mark = screen.getByTestId("brand-mark");
    expect(mark.className).toContain("h-6");
    expect(mark.className).toContain("w-6");
  });
});
