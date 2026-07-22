import { type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

interface CollapsibleRowProps {
  /** The kind marker — a terminal for tool units, a brain for thinking. */
  icon: LucideIcon;
  /** The one-line collapsed summary. */
  summary: string;
  /** Marks the row as reporting a failure. */
  hasError?: boolean;
  /**
   * Whether the row is open. Controlled from above, because the virtualizer
   * recycles rows by position and state kept here would not survive it (#236).
   */
  isExpanded: boolean;
  onToggle: () => void;
  /**
   * The detail revealed when expanded. Omit it when the summary is already the
   * whole row — it then renders as a plain line, with no control that would
   * open onto nothing.
   */
  children?: ReactNode;
  /**
   * Forces the toggle on for a row whose detail is drawn outside it. A fold's
   * units stay with the turns that recorded them, so the summary row opens onto
   * siblings rather than children (#199).
   */
  isExpandable?: boolean;
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
  isExpanded,
  onToggle,
  children,
  isExpandable,
}: CollapsibleRowProps) {
  if (!children && !isExpandable) {
    return (
      <div>
        <div className="flex w-full items-center gap-1.5 px-1.5 py-1 text-xs text-muted-foreground">
          {/* Stands in for the chevron so this row's icon still lines up with
              the expandable rows around it. */}
          <span aria-hidden="true" className="size-3 shrink-0" />
          <Icon size={12} aria-hidden="true" className="shrink-0" />
          <span className="truncate font-mono">{summary}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
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
      {isExpanded && children && (
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
