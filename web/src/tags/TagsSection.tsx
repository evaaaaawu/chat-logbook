import { useMemo, useState } from "react";
import {
  ArrowLeft,
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

interface TagsSectionProps {
  tags: Tag[];
  // How many chats carry a given tag — drives the row count and delete-confirm.
  countForTag: (tagId: string) => number;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: ColorToken) => void;
  onDelete: (id: string) => void;
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
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 group-hover/tag:opacity-100 data-[popup-open]:opacity-100"
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        data-testid="tag-manage-menu"
        align="end"
        sideOffset={4}
        className="w-60 gap-1 p-1"
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
  onRename,
  onRecolor,
  onDelete,
}: {
  tag: Tag;
  count: number;
  onRename: (name: string) => void;
  onRecolor: (color: ColorToken) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li
      data-testid="tag-manage-row"
      data-tag-id={tag.id}
      className="group/tag relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/90 hover:bg-card"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: TAG_COLOR_HEX[tag.color] }}
      />
      {editing ? (
        <RenameRow
          tag={tag}
          onCommit={(name) => {
            onRename(name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{tag.name}</span>
          <ManageMenu
            tag={tag}
            count={count}
            onRenameStart={() => setEditing(true)}
            onRecolor={onRecolor}
            onDelete={onDelete}
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground group-hover/tag:hidden">
            {count}
          </span>
        </>
      )}
    </li>
  );
}

export function TagsSection({
  tags,
  countForTag,
  onRename,
  onRecolor,
  onDelete,
}: TagsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const sorted = useMemo(() => sortTagsByName(tags), [tags]);

  return (
    <div data-testid="tags-section" className="flex flex-col">
      <button
        type="button"
        data-testid="tags-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>Tags</span>
        <span
          data-testid="tags-order-caption"
          title="Sorted A–Z"
          className="flex items-center gap-0.5 text-muted-foreground/80"
        >
          A–Z
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </span>
      </button>
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
                onRename={(name) => onRename(tag.id, name)}
                onRecolor={(color) => onRecolor(tag.id, color)}
                onDelete={() => onDelete(tag.id)}
              />
            ))}
          </ul>
        ))}
    </div>
  );
}
