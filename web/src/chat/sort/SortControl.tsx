import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "@/chat/sort/sortChats";
import type { DirectionLabels, SortAxis } from "@/chat/sort/sortConfig";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/utils";

interface SortControlProps<F extends string> {
  axes: SortAxis<F>[];
  field: F;
  direction: SortDirection;
  isDefault: boolean;
  directionLabels: DirectionLabels<F>;
  onSelectField: (field: F) => void;
  onToggleDirection: () => void;
  testId?: string;
}

export function SortControl<F extends string>({
  axes,
  field,
  direction,
  isDefault,
  directionLabels,
  onSelectField,
  onToggleDirection,
  testId,
}: SortControlProps<F>) {
  const DirectionArrow = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Sort chats"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/4 focus-visible:outline-2 focus-visible:outline-ring",
          isDefault ? "text-muted-foreground" : "text-primary"
        )}
      >
        <ArrowUpDown size={16} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        data-testid={testId}
        align="end"
        sideOffset={6}
        className="w-44 gap-0 overflow-visible p-1"
      >
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sort by
        </div>
        {axes.map((axis) => {
          const active = axis.field === field;
          return (
            <div key={axis.field} className="group/axis relative">
              <button
                type="button"
                // Clicking a different axis selects it; clicking the active axis
                // again flips its direction.
                onClick={() =>
                  active ? onToggleDirection() : onSelectField(axis.field)
                }
                aria-current={active ? "true" : undefined}
                title={active ? "Click to reverse direction" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-white/6"
                )}
              >
                <span>{axis.label}</span>
                {active && <DirectionArrow size={14} aria-hidden="true" />}
              </button>
              {active && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-full top-1/2 ml-3 flex -translate-y-1/2 items-center whitespace-nowrap rounded-md border border-white/10 bg-[#0a0a0a] px-2 py-1 text-xs text-card-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover/axis:opacity-100"
                >
                  {directionLabels[axis.field][direction]}
                </span>
              )}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
