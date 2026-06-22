import { Trash2 } from "lucide-react";
import { ProjectsSection } from "@/chat/projects/ProjectsSection";
import { FilterSummary } from "@/chat/FilterSummary";
import type { ProjectFacet } from "@/chat/projects/deriveProjects";

interface FilterPanelProps {
  deletedCount: number;
  onOpenTrash: () => void;
  projectFacets: ProjectFacet[];
  selectedProjects: ReadonlySet<string>;
  onToggleProject: (project: string) => void;
  onClearFilters: () => void;
}

export function FilterPanel({
  deletedCount,
  onOpenTrash,
  projectFacets,
  selectedProjects,
  onToggleProject,
  onClearFilters,
}: FilterPanelProps) {
  return (
    <div data-testid="filter-panel" className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-sm font-semibold text-foreground">
        <div className="h-4 w-4 rounded bg-primary" />
        Chat Logbook
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <FilterSummary
          activeCount={selectedProjects.size}
          onClear={onClearFilters}
        />
        <ProjectsSection
          facets={projectFacets}
          selected={selectedProjects}
          onToggle={onToggleProject}
        />
      </div>
      <div className="flex h-12 shrink-0 items-center border-t border-border px-2">
        <button
          type="button"
          data-testid="trash-link"
          onClick={onOpenTrash}
          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-card"
        >
          <span className="flex items-center gap-2">
            <Trash2 size={14} aria-hidden="true" />
            Trash
          </span>
          <span className="rounded-full bg-card px-2 text-xs font-semibold tabular-nums text-muted-foreground">
            {deletedCount}
          </span>
        </button>
      </div>
    </div>
  );
}
