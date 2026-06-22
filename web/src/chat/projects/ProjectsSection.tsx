import { useState } from "react";
import { Check, ChevronDown, Folder } from "lucide-react";
import type { ProjectFacet } from "./deriveProjects";

// Projects are ordered by recency; the caption captions that order, with the
// detail in a tooltip.
const ORDER_CAPTION = "Recent";
const ORDER_TOOLTIP = "Sorted by recent activity";

interface ProjectsSectionProps {
  facets: ProjectFacet[];
  selected: ReadonlySet<string>;
  onToggle: (project: string) => void;
}

// A stable, selector-friendly id for the (No project) group, whose project
// value is the empty string.
function rowId(project: string): string {
  return `project-row-${project === "" ? "none" : project}`;
}

export function ProjectsSection({
  facets,
  selected,
  onToggle,
}: ProjectsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-testid="projects-section" className="flex flex-col">
      <button
        type="button"
        data-testid="projects-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>Projects</span>
        <span
          data-testid="projects-order-caption"
          title={ORDER_TOOLTIP}
          className="flex items-center gap-0.5 text-muted-foreground/80"
        >
          {ORDER_CAPTION}
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </span>
      </button>
      {!collapsed && (
        <ul className="flex flex-col gap-0.5">
          {facets.map((facet) => {
            const isSelected = selected.has(facet.project);
            const isNoProject = facet.project === "";
            return (
              <li key={facet.project || "__none__"}>
                <button
                  type="button"
                  data-testid={rowId(facet.project)}
                  aria-pressed={isSelected}
                  onClick={() => onToggle(facet.project)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-primary/15 text-foreground"
                      : "text-foreground/80 hover:bg-card"
                  }`}
                >
                  <Folder
                    size={15}
                    aria-hidden="true"
                    className={`shrink-0 ${
                      isSelected
                        ? "text-primary"
                        : isNoProject
                          ? "text-muted-foreground/60"
                          : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      isNoProject ? "italic text-muted-foreground" : ""
                    }`}
                  >
                    {facet.label}
                  </span>
                  {isSelected && (
                    <Check
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-primary"
                    />
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {facet.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
