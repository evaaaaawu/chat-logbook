import { Trash } from "lucide-react";

interface FilterPanelProps {
  deletedCount: number;
  onOpenTrash: () => void;
}

export function FilterPanel({ deletedCount, onOpenTrash }: FilterPanelProps) {
  return (
    <div data-testid="filter-panel" className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-sm font-semibold text-foreground">
        <div className="h-4 w-4 rounded bg-primary" />
        Chat Logbook
      </div>
      <div className="flex-1 px-4 pt-8 text-center text-sm text-muted-foreground">
        Filters coming soon
        <div className="mt-1 text-xs">Projects, tags, search</div>
      </div>
      <div className="flex h-12 shrink-0 items-center border-t border-border px-2">
        <button
          type="button"
          data-testid="trash-link"
          onClick={onOpenTrash}
          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-card"
        >
          <span className="flex items-center gap-2">
            <Trash size={14} aria-hidden="true" />
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
