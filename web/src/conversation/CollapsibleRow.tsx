import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

interface CollapsibleRowProps {
  /** The kind marker — a terminal for tool units, a brain for thinking. */
  icon: LucideIcon;
  /** The one-line collapsed summary. */
  summary: string;
  /** Marks the row as reporting a failure. */
  hasError?: boolean;
  /** The detail revealed when expanded. */
  children: ReactNode;
}

/**
 * One collapsed line that opens into its detail.
 *
 * The shared visual language for everything the reader skims past by default —
 * tool units, thinking, and later system rows (#193). Kept as one component so
 * those kinds cannot drift apart: they differ only by icon and summary.
 */
export function CollapsibleRow({
  icon: Icon,
  summary,
  hasError,
  children,
}: CollapsibleRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        // Muted and a size down from body text: these rows are the parts of a
        // session the reader scans past, not the prose they came to read.
        className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
      >
        <ChevronDown
          data-testid="row-chevron"
          size={12}
          aria-hidden="true"
          className={`shrink-0 transition-transform ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
        <Icon size={12} aria-hidden="true" className="shrink-0" />
        <span className="truncate font-mono">{summary}</span>
        {hasError && (
          <span
            data-testid="row-error"
            aria-label="Failed"
            className="ml-1 size-1.5 shrink-0 rounded-full bg-destructive"
          />
        )}
      </button>
      {isExpanded && (
        <div
          data-testid="unit-detail"
          // The rule marks the detail's extent, so an expanded unit reads as a
          // nested aside rather than more prose.
          className="mt-1 ml-2 flex flex-col gap-1 border-l border-border pl-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}
