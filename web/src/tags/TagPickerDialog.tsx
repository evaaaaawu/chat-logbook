import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import type { Tag } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import {
  TAG_COLOR_HEX,
  defaultColorFor,
  type ColorToken,
} from "@/tags/palette";
import { ColorSwatches } from "@/tags/ColorSwatches";
import { sortTagsByName } from "@/tags/sortTags";

export type TagState = "all" | "some" | "none";

interface TagPickerDialogProps {
  title: string;
  tags: Tag[];
  // Assignment state of a tag across the target(s). A single chat only ever
  // returns "all" or "none"; batch mode also returns "some" (indeterminate).
  stateFor: (tagId: string) => TagState;
  // Caller maps a toggle to add/remove (single) or stage (batch).
  onToggle: (tagId: string) => void;
  onCreate: (name: string, color: ColorToken) => Promise<Tag | null>;
  // Trigger overrides — lets the same dialog hang off both the "+ Tag" button
  // and the "+N" overflow pill.
  triggerTestId?: string;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  triggerContent?: ReactNode;
  // Controlled open state — batch mode (#163) drives this so it can close the
  // dialog on `Done`. Omit for the self-managed single-Chat popover.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Optional footer below the list — batch mode puts the `Done` button here to
  // apply the staged add/remove diff. Single mode applies each toggle at once
  // and leaves it undefined.
  footer?: ReactNode;
  // Batch mode's Enter action: when the user is not mid-create, Enter anywhere
  // in the dialog submits (equivalent to clicking `Done`). Also stops the
  // keystroke leaking to the global chat shortcuts (e.g. Enter → rename).
  onEnter?: () => void;
}

const DEFAULT_TRIGGER_CLASS =
  "flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

export function TagPickerDialog({
  title,
  tags,
  triggerTestId = "add-tag-button",
  triggerAriaLabel = "Add tag",
  triggerClassName = DEFAULT_TRIGGER_CLASS,
  triggerContent,
  open,
  onOpenChange,
  footer,
  onEnter,
  stateFor,
  onToggle,
  onCreate,
}: TagPickerDialogProps) {
  const [query, setQuery] = useState("");
  // null means "follow the name-derived default"; a value means the user picked.
  const [override, setOverride] = useState<ColorToken | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase();
    const matched =
      q.length === 0
        ? tags
        : tags.filter((t) => t.name.toLowerCase().includes(q));
    return sortTagsByName(matched);
  }, [tags, trimmed]);

  const exactMatch = tags.some(
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange?.(next);
      }}
    >
      <DialogTrigger
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
      </DialogTrigger>
      <DialogContent
        data-testid="tag-picker-dialog"
        className="w-[min(100vw-2rem,34rem)]"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // Mid-create Enter belongs to the create flow (handled on the input);
          // leave it alone so the row isn't submitted instead of the new tag.
          if (canCreate) return;
          // Otherwise Enter submits (batch `Done`) and must not bubble to the
          // global chat shortcuts (Enter → rename the open chat).
          if (onEnter) {
            e.preventDefault();
            e.stopPropagation();
            onEnter();
          }
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
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
            className="w-full rounded-lg border border-border bg-transparent py-2.5 pr-3 pl-10 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <ul className="flex max-h-[22rem] flex-col gap-0.5 overflow-y-auto">
          {filtered.map((tag) => {
            const state = stateFor(tag.id);
            return (
              <li key={tag.id}>
                <button
                  type="button"
                  data-testid="add-tag-option"
                  data-tag-id={tag.id}
                  onClick={() => onToggle(tag.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors hover:bg-white/6"
                >
                  <TriStateCheckbox state={state} />
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TAG_COLOR_HEX[tag.color] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && !canCreate && (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">
              No tags yet.
            </li>
          )}
        </ul>

        {canCreate && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <button
              type="button"
              data-testid="create-tag-button"
              onClick={() => void handleCreate()}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors hover:bg-white/6"
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
                // the input so Enter still creates the tag.
                inputRef.current?.focus();
              }}
            />
          </div>
        )}

        {footer && (
          <div className="flex justify-end border-t border-border pt-3">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Leading checkbox for a tag row. "all" → checked, "none" → empty, "some" →
// indeterminate (only ever reached in batch mode). Presentational: the row
// button owns the click, so this is aria-hidden with the state exposed via the
// role="checkbox" wrapper.
function TriStateCheckbox({ state }: { state: TagState }) {
  return (
    <span
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        state === "none"
          ? "border-muted-foreground/60"
          : "border-primary bg-primary text-primary-foreground"
      }`}
    >
      {state === "all" && (
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      )}
      {state === "some" && (
        <Minus size={12} strokeWidth={3} aria-hidden="true" />
      )}
    </span>
  );
}
