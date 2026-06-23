import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Plus, Search } from "lucide-react";
import type { Tag } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  TAG_COLOR_HEX,
  defaultColorFor,
  type ColorToken,
} from "@/tags/palette";
import { ColorSwatches } from "@/tags/ColorSwatches";
import { sortTagsByName } from "@/tags/sortTags";

interface AddTagPopoverProps {
  // Tags currently assigned to this chat.
  assigned: Tag[];
  // The full Tag catalog to filter over.
  allTags: Tag[];
  onAssign: (tagId: string) => void;
  onRemove: (tagId: string) => void;
  // Create a Tag, then assign it to this chat. Returns the created Tag (or null
  // on failure).
  onCreate: (name: string, color: ColorToken) => Promise<Tag | null>;
  // Trigger overrides — lets the same popover hang off both the "+ Tag" button
  // and the "+N" overflow pill.
  triggerTestId?: string;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  triggerContent?: ReactNode;
}

const DEFAULT_TRIGGER_CLASS =
  "flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

export function AddTagPopover({
  assigned,
  allTags,
  onAssign,
  onRemove,
  onCreate,
  triggerTestId = "add-tag-button",
  triggerAriaLabel = "Add tag",
  triggerClassName = DEFAULT_TRIGGER_CLASS,
  triggerContent,
}: AddTagPopoverProps) {
  const [query, setQuery] = useState("");
  // null means "follow the name-derived default"; a value means the user picked.
  const [override, setOverride] = useState<ColorToken | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const assignedIds = useMemo(
    () => new Set(assigned.map((t) => t.id)),
    [assigned]
  );

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase();
    const matched =
      q.length === 0
        ? allTags
        : allTags.filter((t) => t.name.toLowerCase().includes(q));
    return sortTagsByName(matched);
  }, [allTags, trimmed]);

  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase()
  );
  const canCreate = trimmed.length > 0 && !exactMatch;
  const createColor = override ?? defaultColorFor(trimmed);

  const reset = () => {
    setQuery("");
    setOverride(null);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    await onCreate(trimmed, createColor);
    reset();
  };

  return (
    <Popover onOpenChange={(open) => !open && reset()}>
      <PopoverTrigger
        data-testid={triggerTestId}
        aria-label={triggerAriaLabel}
        className={triggerClassName}
      >
        {triggerContent ?? (
          <>
            <Plus size={12} aria-hidden="true" />
            Tag
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        data-testid="add-tag-popover"
        align="end"
        sideOffset={6}
        className="w-64 gap-2 p-2"
      >
        <div className="relative">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOverride(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="Find or create a tag…"
            aria-label="Find or create a tag"
            className="w-full rounded-md border border-border bg-transparent py-1.5 pr-2 pl-7 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {filtered.map((tag) => {
            const isAssigned = assignedIds.has(tag.id);
            return (
              <li key={tag.id}>
                <button
                  type="button"
                  data-testid="add-tag-option"
                  data-tag-id={tag.id}
                  aria-pressed={isAssigned}
                  onClick={() =>
                    isAssigned ? onRemove(tag.id) : onAssign(tag.id)
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/6"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TAG_COLOR_HEX[tag.color] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {isAssigned && (
                    <Check
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-primary"
                    />
                  )}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && !canCreate && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              No tags yet.
            </li>
          )}
        </ul>

        {canCreate && (
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <button
              type="button"
              data-testid="create-tag-button"
              onClick={() => void handleCreate()}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/6"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: TAG_COLOR_HEX[createColor] }}
              />
              <span className="min-w-0 flex-1 truncate">
                Create <span className="font-medium">“{trimmed}”</span>
              </span>
            </button>
            <ColorSwatches
              value={createColor}
              onChange={(color) => {
                setOverride(color);
                // Picking a swatch moves focus to its button. Return focus to
                // the input so Enter still creates the tag (instead of the
                // keystroke escaping to the global shortcut handler).
                inputRef.current?.focus();
              }}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
