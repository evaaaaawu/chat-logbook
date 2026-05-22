import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Chat } from "@/types";
import { EditableTitle } from "./EditableTitle";

interface ChatListProps {
  mode?: "main" | "trash";
  chats: Chat[];
  selectedId: string | null;
  editingId?: string | null;
  onEditingIdChange?: (id: string | null) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onRenameTitle?: (id: string, title: string) => void;
  onBack?: () => void;
  deletedCount?: number;
  onOpenTrash?: () => void;
  sortControl?: React.ReactNode;
  /** Changes whenever the active sort changes; drives keep-selection-visible scrolling. */
  sortSignature?: string;
}

function getProjectName(projectPath: string): string {
  const segments = projectPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? projectPath;
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return "just now";
}

interface ContextMenuState {
  chatId: string;
  x: number;
  y: number;
}

const TITLE_DISPLAY_CLASS =
  "inline-block max-w-full truncate align-middle rounded px-1.5 py-0.5 -mx-1.5 text-sm font-medium text-accent-foreground cursor-text transition-colors group-hover:bg-white/[0.04]";
const TITLE_INPUT_CLASS =
  "min-w-[12ch] max-w-full rounded border border-border bg-transparent px-1.5 py-0.5 text-sm font-medium text-accent-foreground outline-none focus:border-primary [field-sizing:content]";

function MenuItem({
  icon,
  label,
  hint,
  destructive = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-6 rounded-md px-3 py-1.5 text-left transition-colors ${
        destructive
          ? "text-destructive hover:bg-[#3a1d23]"
          : "hover:bg-white/[0.06]"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{hint}</span>
    </button>
  );
}

function ActionTooltip({ label, hint }: { label: string; hint: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-full top-1/2 mr-1.5 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-[#0a0a0a] px-2 py-1 text-xs text-card-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover/action:opacity-100"
    >
      {label}
      <span className="text-xs tabular-nums text-muted-foreground">{hint}</span>
    </span>
  );
}

export function ChatList({
  mode = "main",
  chats,
  selectedId,
  editingId: editingIdProp,
  onEditingIdChange,
  onSelect,
  onDelete,
  onRestore,
  onRenameTitle,
  onBack,
  deletedCount = 0,
  onOpenTrash,
  sortControl,
  sortSignature,
}: ChatListProps) {
  const [internalEditingId, setInternalEditingId] = useState<string | null>(
    null
  );
  const editingId =
    editingIdProp !== undefined ? editingIdProp : internalEditingId;
  const setEditingId = (next: string | null) => {
    setInternalEditingId(next);
    onEditingIdChange?.(next);
  };
  const isTrash = mode === "trash";
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const prevSortSignature = useRef(sortSignature);

  // Keep the selected chat visible after a sort change; otherwise scroll to top.
  useEffect(() => {
    if (prevSortSignature.current === sortSignature) return;
    prevSortSignature.current = sortSignature;
    if (selectedId && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView?.({ block: "nearest" });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [sortSignature, selectedId]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    const id = window.setTimeout(() => {
      document.addEventListener("click", close);
    }, 0);
    document.addEventListener("keydown", closeOnEsc);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", closeOnEsc);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    setContextMenu({ chatId, x: e.clientX, y: e.clientY });
  };

  return (
    <div data-testid="chat-list" className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 text-sm">
        {isTrash ? (
          <>
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back
            </button>
            <span className="font-semibold text-accent-foreground">
              Trash ({chats.length})
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2">
              <span className="font-semibold text-accent-foreground">
                Chats
              </span>
              <span className="rounded-full bg-card px-2 text-xs font-semibold tabular-nums text-muted-foreground">
                {chats.length}
              </span>
            </span>
            {sortControl}
          </>
        )}
      </div>
      <div
        ref={scrollContainerRef}
        data-testid="chat-scroll"
        className="flex-1 overflow-y-auto"
      >
        {chats.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {isTrash ? (
              <>
                <div className="font-medium text-foreground">
                  Trash is empty
                </div>
                <div className="mt-1 text-xs">
                  Deleted chats appear here. They stay until you restore them.
                </div>
              </>
            ) : (
              <>
                <div className="font-medium text-foreground">No chats</div>
                {deletedCount > 0 && onOpenTrash && (
                  <div className="mt-1 text-xs">
                    Check{" "}
                    <button
                      type="button"
                      onClick={onOpenTrash}
                      className="text-primary hover:underline"
                    >
                      Trash ({deletedCount})
                    </button>{" "}
                    to restore deleted ones.
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          chats.map((chat) => {
            const isSelected = chat.id === selectedId;
            const isEditing = editingId === chat.id && !!onRenameTitle;
            const rowClassName = `flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-card ${
              isSelected
                ? "border-l-2 border-l-primary bg-card"
                : "border-l-2 border-l-transparent"
            }`;
            const titleNode =
              onRenameTitle && !isTrash ? (
                <EditableTitle
                  value={chat.title}
                  editing={isEditing}
                  onEditStart={() => setEditingId(chat.id)}
                  onEditEnd={() => setEditingId(null)}
                  onSave={(next) => onRenameTitle(chat.id, next)}
                  onDisplayClick={(e) => {
                    if (isSelected) {
                      e.stopPropagation();
                    } else {
                      e.preventDefault();
                    }
                  }}
                  displayClassName={TITLE_DISPLAY_CLASS}
                  inputClassName={TITLE_INPUT_CLASS}
                  inputAriaLabel="Chat title"
                />
              ) : (
                <span className={TITLE_DISPLAY_CLASS}>{chat.title}</span>
              );
            const rowContent = (
              <>
                <div className="min-w-0">{titleNode}</div>
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    {getProjectName(chat.project)}
                  </span>
                  <span className="ml-2 shrink-0">
                    {getRelativeTime(chat.updatedAt)}
                  </span>
                </span>
              </>
            );
            return (
              <div
                key={chat.id}
                ref={isSelected ? selectedRowRef : undefined}
                data-testid="chat-row"
                className="group relative"
                onContextMenu={(e) => handleContextMenu(e, chat.id)}
              >
                {isEditing ? (
                  <div className={rowClassName}>{rowContent}</div>
                ) : (
                  <button
                    onClick={() => onSelect(chat.id)}
                    className={rowClassName}
                  >
                    {rowContent}
                  </button>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  {isTrash && onRestore ? (
                    <span className="group/action relative">
                      <button
                        type="button"
                        aria-label={`Restore: ${chat.title}`}
                        onClick={() => onRestore(chat.id)}
                        className="rounded-md border border-border/60 bg-card p-1.5 text-muted-foreground opacity-0 shadow-sm transition-all hover:border-[#5f7a26] hover:bg-[#1f2e15] hover:text-[#859900] group-hover:opacity-100 focus:opacity-100"
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                      </button>
                      <ActionTooltip label="Restore" hint="⌫" />
                    </span>
                  ) : (
                    !isEditing && (
                      <span className="group/action relative">
                        <button
                          type="button"
                          aria-label={`Move to trash: ${chat.title}`}
                          onClick={() => onDelete(chat.id)}
                          className="rounded-md border border-border/60 bg-card p-1.5 text-muted-foreground opacity-0 shadow-sm transition-all hover:border-[#a13836] hover:bg-[#3a1d23] hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                        <ActionTooltip label="Move to Trash" hint="⌫" />
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {contextMenu && (
        <div
          role="menu"
          className="fixed z-50 min-w-[200px] rounded-md border border-border bg-card p-1 text-sm shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {!isTrash && onRenameTitle && (
            <MenuItem
              icon={<Pencil size={14} aria-hidden="true" />}
              label="Rename"
              hint="F2 / ↵"
              onClick={() => {
                setEditingId(contextMenu.chatId);
                setContextMenu(null);
              }}
            />
          )}
          {isTrash && onRestore ? (
            <MenuItem
              icon={<RotateCcw size={14} aria-hidden="true" />}
              label="Restore"
              hint="⌫"
              onClick={() => {
                onRestore(contextMenu.chatId);
                setContextMenu(null);
              }}
            />
          ) : (
            <MenuItem
              icon={<Trash2 size={14} aria-hidden="true" />}
              label="Move to Trash"
              hint="⌫"
              destructive
              onClick={() => {
                onDelete(contextMenu.chatId);
                setContextMenu(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
