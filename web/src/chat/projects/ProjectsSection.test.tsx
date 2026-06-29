import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProjectsSection } from "./ProjectsSection";
import type { ProjectFacet } from "./projectFacets";

const facets: ProjectFacet[] = [
  { project: "web", label: "web", count: 3, lastActiveAt: 30 },
  { project: "api", label: "api", count: 1, lastActiveAt: 20 },
  { project: "", label: "(No project)", count: 2, lastActiveAt: 10 },
];

function renderSection(overrides?: {
  selected?: Set<string>;
  onToggle?: (p: string) => void;
}) {
  return render(
    <ProjectsSection
      facets={facets}
      selected={overrides?.selected ?? new Set()}
      onToggle={overrides?.onToggle ?? (() => {})}
    />
  );
}

describe("ProjectsSection", () => {
  it("renders a row per project showing its label and count", () => {
    renderSection();
    const section = screen.getByTestId("projects-section");
    expect(within(section).getByText("web")).toBeInTheDocument();
    expect(within(section).getByText("api")).toBeInTheDocument();
    expect(within(section).getByText("(No project)")).toBeInTheDocument();
    // The web row carries its count.
    const webRow = screen.getByTestId("project-row-web");
    expect(within(webRow).getByText("3")).toBeInTheDocument();
  });

  it("calls onToggle with the project when a row is clicked", async () => {
    const onToggle = vi.fn();
    renderSection({ onToggle });
    await userEvent.click(screen.getByTestId("project-row-api"));
    expect(onToggle).toHaveBeenCalledWith("api");
  });

  it("marks a selected row as pressed", () => {
    renderSection({ selected: new Set(["web"]) });
    expect(screen.getByTestId("project-row-web")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTestId("project-row-api")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("shows a check on the selected row only", () => {
    const { container } = renderSection({ selected: new Set(["web"]) });
    const webRow = screen.getByTestId("project-row-web");
    const apiRow = screen.getByTestId("project-row-api");
    // The check icon (lucide) renders as an svg with the `lucide-check` class.
    expect(webRow.querySelector(".lucide-check")).not.toBeNull();
    expect(apiRow.querySelector(".lucide-check")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("shows a 'Recent' order caption with a tooltip", () => {
    renderSection();
    const caption = screen.getByTestId("projects-order-caption");
    expect(caption).toHaveTextContent("Recent");
    expect(caption).toHaveAttribute("title", "Sorted by recent activity");
  });

  it("collapses and expands the project list from the header", async () => {
    renderSection();
    expect(screen.getByTestId("project-row-web")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("projects-header"));
    expect(screen.queryByTestId("project-row-web")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("projects-header"));
    expect(screen.getByTestId("project-row-web")).toBeInTheDocument();
  });
});
