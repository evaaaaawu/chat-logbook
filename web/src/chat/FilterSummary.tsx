interface FilterSummaryProps {
  /** How many filters are currently active (selected Projects, and later Tags). */
  activeCount: number;
  onClear: () => void;
}

/**
 * The "N filters active — Clear" bar above the filter sections. Hidden when no
 * filter is active. Clear resets every filter at once.
 */
export function FilterSummary({ activeCount, onClear }: FilterSummaryProps) {
  if (activeCount === 0) return null;
  return (
    <div
      data-testid="filters-summary"
      className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground"
    >
      <span>
        {activeCount} {activeCount === 1 ? "filter" : "filters"} active
      </span>
      <button
        type="button"
        data-testid="filters-clear"
        onClick={onClear}
        className="text-card-foreground transition-colors hover:text-foreground-bright"
      >
        Clear
      </button>
    </div>
  );
}
