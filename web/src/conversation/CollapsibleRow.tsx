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
  /**
   * Marks the one row a folded Run collapses to. While closed it wears its
   * chevron in --primary — the colour cue that these lines open (#238). Spent
   * once the row is open, and never worn by the individual rows inside it, so
   * the accent stays rare enough to read as a cue rather than decoration.
   */
  isSummary?: boolean;
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
  isSummary,
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

  // The chevron carries the "this opens" cue in colour, spent once open (#238):
  //   folded summary row  → --primary, the rare accent that reads as a cue
  //   collapsed individual → muted, taking the accent only on hover, where it
  //                          answers a question the reader is actively asking
  //   any expanded row     → muted, the affordance already spent
  const chevronColour = isExpanded
    ? ""
    : isSummary
      ? "text-primary"
      : "group-hover:text-primary";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        // Muted and a size down from body text: these rows are the parts of a
        // session the reader scans past, not the prose they came to read.
        className="group flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
      >
        <ChevronDown
          data-testid="row-chevron"
          size={12}
          aria-hidden="true"
          className={`shrink-0 transition-transform ${chevronColour} ${
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
