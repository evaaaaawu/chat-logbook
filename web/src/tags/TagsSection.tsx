import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Palette,
  Trash2,
} from "lucide-react";
import type { Tag } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { TAG_COLOR_HEX, type ColorToken } from "@/tags/palette";
import { ColorSwatches } from "@/tags/ColorSwatches";
import { sortTagsByName } from "@/tags/sortTags";
import { UNTAGGED } from "@/tags/untagged";
import type { TagMode } from "@/tags/tagModePreference";

interface TagsSectionProps {
  tags: Tag[];
  // How many chats carry a given tag — drives the row count and delete-confirm.
  countForTag: (tagId: string) => number;
  // How many chats hold no tags at all — the count on the `Untagged` row.
  untaggedCount: number;
  // The active Tag filter: tag ids plus the `UNTAGGED` sentinel. AND within.
  selected: ReadonlySet<string>;
  // How the selected Tags combine: `all` (AND) or `any` (OR). The Match control
  // switches it; `any` also drops the Untagged dimming (ADR-0016 update).
  tagMode: TagMode;
  onTagModeChange: (mode: TagMode) => void;
  onToggle: (tagId: string) => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: ColorToken) => void;
  onDelete: (id: string) => void;
}

// The All / Any match control beside the Tags header label. `all` ANDs the
// selected Tags, `any` ORs them (ADR-0016 update). A bordered segmented control:
// a hairline frame with the two `aria-pressed` segments flush to it (no inner
// gap) and a divider between them, the active one on a soft `bg-primary/15`
// fill. `overflow-hidden` clips the active fill to the frame's rounded corners.
// A sibling of the collapse toggle, never nested in it.
function MatchControl({
  mode,
  onChange,
}: {
  mode: TagMode;
  onChange: (mode: TagMode) => void;
}) {
  const modes = ["all", "any"] as const;
  return (
    <div
      data-testid="tag-match-control"
      role="group"
      aria-label="Tag match mode"
      className="flex items-center overflow-hidden rounded-md border border-border text-[11px] font-medium"
    >
      {modes.map((value, i) => (
        <button
          key={value}
          type="button"
          data-testid={`tag-match-${value}`}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={`px-2 py-0.5 capitalize transition-colors ${
            i < modes.length - 1 ? "border-r border-border" : ""
          } ${
            mode === value
              ? "bg-primary/15 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function RenameRow({
  tag,
  onCommit,
  onCancel,
}: {
  tag: Tag;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(tag.name);
  const commit = () => {
    const next = value.trim();
    if (next.length > 0 && next !== tag.name) onCommit(next);
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") onCancel();
      }}
      aria-label={`Rename tag ${tag.name}`}
      className="min-w-0 flex-1 rounded border border-primary bg-transparent px-1.5 py-0.5 text-sm text-foreground outline-none"
    />
  );
}

// The ⋯ control: one portaled popover with three views (menu / recolor /
// delete-confirm). Living in the portal means the wide swatch row and the
// confirm card render above everything instead of being clipped by the
// narrow navigation column's overflow.
function ManageMenu({
  tag,
  count,
  onRenameStart,
  onRecolor,
  onDelete,
}: {
  tag: Tag;
  count: number;
  onRenameStart: () => void;
  onRecolor: (color: ColorToken) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "recolor" | "delete">("menu");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setView("menu");
      }}
    >
      <PopoverTrigger
        aria-label={`Manage tag ${tag.name}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-card text-muted-foreground opacity-0 transition hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 group-hover/tag:opacity-100 data-popup-open:opacity-100 pointer-events-none focus-visible:pointer-events-auto group-hover/tag:pointer-events-auto data-popup-open:pointer-events-auto"
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        data-testid="tag-manage-menu"
        align="end"
        sideOffset={4}
        // Width is anchored by the Recolor view's 8-swatch palette (~218px on
        // one row); w-56 keeps it single-row while staying as tight as the
        // widest view allows. The three views share one width to avoid resizing
        // jank when switching between them.
        className="w-56 gap-1 p-1"
      >
        {view === "menu" && (
          <>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRenameStart();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/6"
            >
              <Pencil size={14} aria-hidden="true" />
              Rename
            </button>
            <button
              type="button"
              data-testid="tag-recolor-button"
              onClick={() => setView("recolor")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/6"
            >
              <Palette size={14} aria-hidden="true" />
              Recolor
            </button>
            <button
              type="button"
              onClick={() => setView("delete")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-[#3a1d23]"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          </>
        )}

        {view === "recolor" && (
          <div className="flex flex-col gap-2 p-1">
            <button
              type="button"
              onClick={() => setView("menu")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={12} aria-hidden="true" />
              Color
            </button>
            <ColorSwatches value={tag.color} onChange={onRecolor} />
          </div>
        )}

        {view === "delete" && (
          <div data-testid="tag-delete-confirm" className="p-1.5">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Trash2
                size={14}
                aria-hidden="true"
                className="text-destructive"
              />
              Delete tag “{tag.name}”?
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              It will be removed from{" "}
              <span className="font-medium text-foreground">
                {count} {count === 1 ? "chat" : "chats"}
              </span>
              . This can’t be undone.
            </p>
            <div className="mt-2.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setView("menu")}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-white/6"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="tag-delete-confirm-button"
                onClick={() => {
                  onDelete();
                  setOpen(false);
                }}
                className="rounded-md bg-destructive px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TagRow({
  tag,
  count,
  isSelected,
  dimmed,
  onToggle,
  onRename,
  onRecolor,
  onDelete,
}: {
  tag: Tag;
  count: number;
  isSelected: boolean;
  // Dimmed while the `Untagged` group is active: a real Tag can't combine with
  // it, so the row reads as "not applicable right now". Still clickable —
  // clicking switches the filter to this Tag (and drops `Untagged`).
  dimmed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: ColorToken) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li
        data-testid="tag-manage-row"
        data-tag-id={tag.id}
        className="group/tag relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/90"
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: TAG_COLOR_HEX[tag.color] }}
        />
        <RenameRow
          tag={tag}
          onCommit={(name) => {
            onRename(name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  // The row body is a filter toggle; the ⋯ menu floats over the count slot so it
  // never takes a layout column. That keeps the ✓ and count flush-right, exactly
  // like a Project row — and matches #10's intent of count and menu sharing one
  // spot, swapped on hover. We never nest interactive elements (the menu is a
  // sibling of the toggle, not a child). Selecting AND-narrows the chat list.
  return (
    <li
      data-testid="tag-manage-row"
      data-tag-id={tag.id}
      data-dimmed={dimmed ? "true" : undefined}
      className={`group/tag relative flex items-center rounded-md pr-2 text-sm transition ${
        isSelected ? "bg-primary/15" : "hover:bg-card"
      } ${dimmed ? "opacity-40 hover:opacity-100" : ""}`}
    >
      <button
        type="button"
        data-testid={`tag-filter-${tag.id}`}
        aria-pressed={isSelected}
        onClick={onToggle}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left group-hover/tag:pr-8 ${
          isSelected ? "text-foreground" : "text-foreground/90"
        }`}
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: TAG_COLOR_HEX[tag.color] }}
        />
        <span className="min-w-0 flex-1 truncate">{tag.name}</span>
        {isSelected && (
          <Check
            size={14}
            aria-hidden="true"
            // Hover hands the trailing slot to the ⋯ control; the row's tint
            // still carries the selected state, so the ✓ steps aside cleanly
            // instead of colliding with the menu.
            className="shrink-0 text-primary group-hover/tag:hidden"
          />
        )}
      </button>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground group-hover/tag:hidden">
        {count}
      </span>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <ManageMenu
          tag={tag}
          count={count}
          onRenameStart={() => setEditing(true)}
          onRecolor={onRecolor}
          onDelete={onDelete}
        />
      </span>
    </li>
  );
}

// The `Untagged` group is pinned last: no color, no management menu, just a
// filter toggle for "Chats with zero Tags".
function UntaggedRow({
  count,
  isSelected,
  onToggle,
}: {
  count: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={`relative flex items-center rounded-md pr-2 text-sm transition-colors ${
        isSelected ? "bg-primary/15" : "hover:bg-card"
      }`}
    >
      <button
        type="button"
        data-testid="tag-filter-untagged"
        aria-pressed={isSelected}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-muted-foreground/40"
        />
        <span className="min-w-0 flex-1 truncate italic">Untagged</span>
        {isSelected && (
          <Check
            size={14}
            aria-hidden="true"
            className="shrink-0 text-primary"
          />
        )}
      </button>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </li>
  );
}

export function TagsSection({
  tags,
  countForTag,
  untaggedCount,
  selected,
  tagMode,
  onTagModeChange,
  onToggle,
  onRename,
  onRecolor,
  onDelete,
}: TagsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const sorted = useMemo(() => sortTagsByName(tags), [tags]);
  // While Untagged is the active filter in All mode, real Tags can't combine
  // with it, so they read as dimmed-but-available (clicking one switches the
  // filter). In Any mode "Untagged OR Tag X" is a real union, so no dimming
  // (ADR-0016 update).
  const untaggedActive = selected.has(UNTAGGED);
  const dimRealTags = untaggedActive && tagMode === "all";

  return (
    <div data-testid="tags-section" className="flex flex-col">
      {/* Header row: the chevron leads the "Tags" toggle, with the All/Any
          match control beside it on the left; the "A–Z" order caption stays on
          the right. Both "Tags" and the A–Z caption are collapse toggles; the
          chevron now leads the "Tags" toggle (matching CollapsibleRow,
          #247/#238). The match control is a sibling — never nested — so its
          buttons don't also collapse the section, and it stays visible while
          collapsed. */}
      <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="tags-header"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            {/* Accented in --primary while collapsed — the rare "this opens"
                cue, spent once expanded. */}
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`shrink-0 transition-transform ${
                collapsed ? "-rotate-90 text-primary" : ""
              }`}
            />
            <span>Tags</span>
          </button>
          {sorted.length > 0 && (
            <MatchControl mode={tagMode} onChange={onTagModeChange} />
          )}
        </div>
        <button
          type="button"
          data-testid="tags-order-caption"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          title="Sorted A–Z"
          className="text-muted-foreground/80 transition-colors hover:text-foreground"
        >
          A–Z
        </button>
      </div>
      {!collapsed &&
        (sorted.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No tags yet. Add one from a chat’s header.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sorted.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                count={countForTag(tag.id)}
                isSelected={selected.has(tag.id)}
                dimmed={dimRealTags}
                onToggle={() => onToggle(tag.id)}
                onRename={(name) => onRename(tag.id, name)}
                onRecolor={(color) => onRecolor(tag.id, color)}
                onDelete={() => onDelete(tag.id)}
              />
            ))}
            <UntaggedRow
              count={untaggedCount}
              isSelected={selected.has(UNTAGGED)}
              onToggle={() => onToggle(UNTAGGED)}
            />
          </ul>
        ))}
    </div>
  );
}
