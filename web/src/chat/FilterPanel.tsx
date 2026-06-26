import { Trash2 } from "lucide-react";
import { ProjectsSection } from "@/chat/projects/ProjectsSection";
import { FilterSummary } from "@/chat/FilterSummary";
import type { ProjectFacet } from "@/chat/projects/deriveProjects";
import { TagsSection } from "@/tags/TagsSection";
import type { Tag } from "@/types";
import type { ColorToken } from "@/tags/palette";

interface FilterPanelProps {
  onOpenTrash: () => void;
  projectFacets: ProjectFacet[];
  selectedProjects: ReadonlySet<string>;
  onToggleProject: (project: string) => void;
  onClearFilters: () => void;
  tags: Tag[];
  countForTag: (tagId: string) => number;
  untaggedCount: number;
  selectedTags: ReadonlySet<string>;
  onToggleTag: (tagId: string) => void;
  onRenameTag: (id: string, name: string) => void;
  onRecolorTag: (id: string, color: ColorToken) => void;
  onDeleteTag: (id: string) => void;
}

export function FilterPanel({
  onOpenTrash,
  projectFacets,
  selectedProjects,
  onToggleProject,
  onClearFilters,
  tags,
  countForTag,
  untaggedCount,
  selectedTags,
  onToggleTag,
  onRenameTag,
  onRecolorTag,
  onDeleteTag,
}: FilterPanelProps) {
  return (
    <div data-testid="filter-panel" className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-sm font-semibold text-foreground">
        <div className="h-4 w-4 rounded bg-primary" />
        Chat Logbook
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <FilterSummary
          activeCount={selectedProjects.size + selectedTags.size}
          onClear={onClearFilters}
        />
        <ProjectsSection
          facets={projectFacets}
          selected={selectedProjects}
          onToggle={onToggleProject}
        />
        <TagsSection
          tags={tags}
          countForTag={countForTag}
          untaggedCount={untaggedCount}
          selected={selectedTags}
          onToggle={onToggleTag}
          onRename={onRenameTag}
          onRecolor={onRecolorTag}
          onDelete={onDeleteTag}
        />
      </div>
      <div className="flex h-12 shrink-0 items-center border-t border-border px-2">
        {/* No count badge: the active window does not know the full trashed
            total without a full load, and the list is moving to paginated reads,
            so the count is dropped rather than shown
            per-mode. The Trash view itself still lists everything. */}
        <button
          type="button"
          data-testid="trash-link"
          onClick={onOpenTrash}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-card"
        >
          <Trash2 size={14} aria-hidden="true" />
          Trash
        </button>
      </div>
    </div>
  );
}
