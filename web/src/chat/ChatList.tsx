import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Chat } from "@/types";
import { EditableTitle } from "@/metadata/EditableTitle";
import { TagChipList } from "@/tags/TagChipList";
import { useCursorNavigation } from "@/chat/useCursorNavigation";

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
  onOpenTrash?: () => void;
  sortControl?: React.ReactNode;
  /**
   * The List count shown in the "Chats N" header (#131 Phase A). Server-derived
   * so it reflects the view's whole universe, not just the loaded page window.
   * Falls back to the loaded count when omitted (e.g. a filtered list, whose
   * accurate total is Phase B).
   */
  total?: number;
  /** Changes whenever the active sort changes; drives keep-selection-visible scrolling. */
  sortSignature?: string;
  /** True while a further page can be fetched; gates near-bottom loading. */
  hasMore?: boolean;
  /** Called when the user scrolls within a few rows of the loaded window's end. */
  onLoadMore?: () => void;
  /**
   * True while a page evicted above the bounded window can be re-fetched; gates
   * near-top loading (#132). False at the list head and on the full path.
   */
  hasPrevious?: boolean;
  /** Called when the user scrolls within a few rows of the loaded window's start. */
  onLoadPrevious?: () => void;
  /**
   * The Selection — the set of Chats marked for a batch action (#161), distinct
   * from the Open Chat. When provided, rows reveal a checkbox on hover and a
   * batch bar appears once at least one Chat is marked.
   */
  selectedIds?: ReadonlySet<string>;
  /** `Cmd`/`Ctrl`+click on a row: toggle that Chat's Selection membership. */
  onToggleSelect?: (id: string) => void;
  /**
   * `Shift`+click on a row: range-select from the anchor to that Chat. `additive`
   * (`Cmd`/`Ctrl`+`Shift`) unions the range with the current Selection instead
   * of replacing it.
   */
  onRangeSelect?: (id: string, additive: boolean) => void;
  /** The batch bar's Clear (and `Esc`): collapse the Selection to the Open Chat. */
  onClearSelection?: () => void;
  /** The batch bar's Move to Trash: trash every Chat in the Selection. */
  onBatchTrash?: () => void;
}

// Trigger the next page once the rendered window reaches within this many rows
// of the end (or, for the previous page, the start), so the fetch overlaps the
// remaining scroll rather than stalling at the edge.
const LOAD_MORE_THRESHOLD = 5;
const LOAD_PREVIOUS_THRESHOLD = 5;

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
  "inline-block max-w-full truncate align-middle rounded px-1.5 py-0.5 -mx-1.5 text-sm font-medium text-accent-foreground cursor-text transition-colors group-hover:bg-white/4";
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
        destructive ? "text-destructive hover:bg-[#3a1d23]" : "hover:bg-white/6"
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

function ActionTooltip({ label, hint }: { label: string; hint?: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-full top-1/2 mr-1.5 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-[#0a0a0a] px-2 py-1 text-xs text-card-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover/action:opacity-100"
    >
      {label}
      {hint && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {hint}
        </span>
      )}
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
  onOpenTrash,
  sortControl,
  total,
  sortSignature,
  hasMore = false,
  onLoadMore,
  hasPrevious = false,
  onLoadPrevious,
  selectedIds,
  onToggleSelect,
  onRangeSelect,
  onClearSelection,
  onBatchTrash,
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
  const prevSortSignature = useRef(sortSignature);

  // TanStack Virtual's useVirtualizer returns functions (e.g. measureElement)
  // that the React Compiler cannot memoize without risking stale UI, so the
  // compiler intentionally skips memoizing this component. This is expected and
  // safe here: the virtualizer values are consumed locally and not passed into
  // other memoized components/hooks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: chats.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 84,
    overscan: 8,
    initialRect: { width: 320, height: 600 },
    // Key rows by their stable chat id so the virtualizer's measurement cache
    // survives a window mutation. When the bounded window evicts a page above or
    // re-fetches one on scroll-back (#132), the surviving rows keep their
    // measured offsets, anchoring scroll to the content under the viewport.
    getItemKey: (index) => chats[index]?.id ?? index,
  });

  // The Cursor: ArrowUp/ArrowDown walk a focus-ring row through the list and,
  // debounced, open it (opening = the Open Chat, i.e. onSelect). Distinct from
  // the Open Chat and the Selection (see CONTEXT.md).
  const { cursorId, cursorIndex } = useCursorNavigation({
    chats,
    openId: selectedId,
    onOpen: onSelect,
  });

  // Keep the Cursor visible: scroll its row into the virtualized window as it
  // moves. The Cursor may be far outside the rendered window, so scroll by
  // index through the virtualizer rather than a DOM ref.
  useEffect(() => {
    if (cursorIndex < 0) return;
    virtualizer.scrollToIndex(cursorIndex, { align: "auto" });
  }, [cursorIndex, virtualizer]);

  // Keep the selected chat visible after a sort change; otherwise scroll to top.
  // The selected row may be far outside the rendered window, so scroll by index
  // through the virtualizer rather than relying on a DOM ref.
  useEffect(() => {
    if (prevSortSignature.current === sortSignature) return;
    const selectedIndex = selectedId
      ? chats.findIndex((chat) => chat.id === selectedId)
      : -1;
    // A sort change can swap the data source (paginated <-> full-load), whose
    // chats arrive a tick later. If a selection exists but is not in the list
    // yet, wait for it rather than consuming the signal and scrolling to top —
    // the effect re-runs when chats update.
    if (selectedId && selectedIndex < 0) return;
    prevSortSignature.current = sortSignature;
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [sortSignature, selectedId, chats, virtualizer]);

  // Fetch the next page as the rendered window nears the end of the loaded
  // chats. The virtualizer only renders rows around the viewport, so the last
  // virtual item's index tracks how far the user has scrolled without a manual
  // scroll listener. onLoadMore guards against overlapping fetches itself.
  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    if (lastVisibleIndex >= chats.length - 1 - LOAD_MORE_THRESHOLD) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore, lastVisibleIndex, chats.length]);

  // Symmetric near-top detector: re-fetch the page evicted above the bounded
  // window as the user scrolls back within a few rows of the start (#132). The
  // first virtual item's index tracks the scroll-back distance; onLoadPrevious
  // guards against overlapping fetches itself.
  const firstVisibleIndex = virtualItems[0]?.index ?? -1;
  useEffect(() => {
    if (!hasPrevious || !onLoadPrevious) return;
    if (
      firstVisibleIndex >= 0 &&
      firstVisibleIndex <= LOAD_PREVIOUS_THRESHOLD
    ) {
      onLoadPrevious();
    }
  }, [hasPrevious, onLoadPrevious, firstVisibleIndex]);

  // Anchor the viewport to a stable row across bounded-window mutations (#132).
  // On scroll, remember the row at the viewport top plus the pixel offset into
  // it; after the window evicts a page above or re-fetches one on scroll-back,
  // restore the scroll so that same row stays put. Without this, removing or
  // prepending rows above the viewport jumps the content and the near-edge
  // detectors mis-fire (or stall), since the loaded window's length is constant.
  const anchorRef = useRef<{ id: string; index: number; delta: number } | null>(
    null
  );
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const offset = el.scrollTop;
    const item = virtualizer.getVirtualItemForOffset(offset);
    const id = item ? chats[item.index]?.id : undefined;
    if (item && id) {
      anchorRef.current = { id, index: item.index, delta: offset - item.start };
    }
  }, [virtualizer, chats]);

  useLayoutEffect(() => {
    // A sort/filter re-anchor owns the scroll (it resets to top or the
    // selection); drop the stale anchor and leave the scroll to that effect.
    if (prevSortSignature.current !== sortSignature) {
      anchorRef.current = null;
      return;
    }
    const el = scrollContainerRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    const newIndex = chats.findIndex((c) => c.id === anchor.id);
    // Only adjust when rows actually shifted above the anchor; a pure field
    // update leaves its index unchanged.
    if (newIndex < 0 || newIndex === anchor.index) return;
    const start = virtualizer.getOffsetForIndex(newIndex, "start")?.[0];
    if (start === undefined) return;
    el.scrollTop = start + anchor.delta;
    anchorRef.current = { ...anchor, index: newIndex };
  }, [chats, virtualizer, sortSignature]);

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

  // The Selection lives only in the main Chat list for now (batch Move to Trash,
  // #161); the Trash view's batch Restore is a later issue.
  const selectionEnabled = !!onToggleSelect && !isTrash;
  const selectionCount = selectedIds?.size ?? 0;

  // A plain row-body click opens the Chat (collapsing the Selection to it); a
  // modifier click is a Selection gesture instead. Shift takes precedence so
  // Cmd/Ctrl+Shift is an additive range: Shift+click paints a range from the
  // anchor (replacing the rest), Cmd/Ctrl+Shift+click adds the range, and a bare
  // Cmd/Ctrl+click toggles one id. There is no checkbox — a Selection member
  // wears the accent instead. preventDefault suppresses the browser's
  // shift-click text selection over the row.
  const handleRowClick = (e: React.MouseEvent, chatId: string) => {
    const meta = e.metaKey || e.ctrlKey;
    if (selectionEnabled && e.shiftKey) {
      e.preventDefault();
      onRangeSelect?.(chatId, meta);
      return;
    }
    if (selectionEnabled && meta) {
      e.preventDefault();
      onToggleSelect?.(chatId);
      return;
    }
    onSelect(chatId);
  };

  // Esc collapses a multi-selection back to the primary (the batch bar's Clear
  // shares the path), before any other Esc handling. Only acts on a real
  // multi-selection (≥ 2) so a lone Open Chat's Esc still falls through to the
  // app-level handler (Trash → main).
  useEffect(() => {
    if (selectionCount < 2 || !onClearSelection) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClearSelection();
      }
    };
    // Capture so the Selection clears before App's global Esc (view switch).
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [selectionCount, onClearSelection]);

  return (
    <div data-testid="chat-list" className="relative flex h-full flex-col">
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
            {sortControl}
          </>
        ) : (
          <>
            <span className="flex items-center gap-2">
              <span className="font-semibold text-accent-foreground">
                Chats
              </span>
              <span
                data-testid="chat-list-count"
                className="rounded-full bg-card px-2 text-xs font-semibold tabular-nums text-muted-foreground"
              >
                {total ?? chats.length}
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
        onScroll={handleScroll}
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
                {onOpenTrash && (
                  <div className="mt-1 text-xs">
                    Check{" "}
                    <button
                      type="button"
                      onClick={onOpenTrash}
                      className="text-primary hover:underline"
                    >
                      Trash
                    </button>{" "}
                    to restore deleted ones.
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
            // A click that lands on the empty area below the rows (not on a row
            // button) collapses a multi-selection back to the primary.
            onClick={(e) => {
              if (
                selectionEnabled &&
                selectionCount >= 2 &&
                e.target === e.currentTarget
              ) {
                onClearSelection?.();
              }
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const chat = chats[virtualItem.index];
              const isSelected = chat.id === selectedId;
              const isCursor = chat.id === cursorId;
              const isInSelection = selectedIds?.has(chat.id) ?? false;
              // Two-tier highlight: the primary (Open Chat, or the Cursor before
              // its debounced open lands) wears the strong accent — left primary
              // border + fill — exactly like a clicked row. A Selection member
              // that is not the primary wears a lighter fill with no left border,
              // so what you are reading stays distinct from what you have merely
              // marked (see CONTEXT.md, #161).
              const isPrimary = isSelected || isCursor;
              const isMarked = isInSelection && !isPrimary;
              const isEditing = editingId === chat.id && !!onRenameTitle;
              // Suppress the browser's focus-visible outline so a mouse-clicked
              // row doesn't strand a ring when keyboard navigation then moves the
              // Cursor off it.
              const rowClassName = `flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-card focus-visible:outline-none ${
                isPrimary
                  ? "border-l-2 border-l-primary bg-card"
                  : isMarked
                    ? "border-l-2 border-l-transparent bg-primary/10"
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
                  {chat.tags && chat.tags.length > 0 && (
                    <TagChipList tags={chat.tags} />
                  )}
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
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  data-testid="chat-row"
                  data-cursor={isCursor || undefined}
                  className="group absolute left-0 right-0 top-0"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                  onContextMenu={(e) => handleContextMenu(e, chat.id)}
                >
                  {isEditing ? (
                    <div className={rowClassName}>{rowContent}</div>
                  ) : (
                    <button
                      onClick={(e) => handleRowClick(e, chat.id)}
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
            })}
          </div>
        )}
      </div>
      {contextMenu && (
        <div
          role="menu"
          className="fixed z-50 min-w-50 rounded-md border border-border bg-card p-1 text-sm shadow-lg"
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
      {selectionEnabled && selectionCount >= 2 && (
        <div
          data-testid="batch-bar"
          className="absolute inset-x-4 bottom-4 z-20 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg"
        >
          <span className="flex items-center gap-3">
            <span className="font-medium tabular-nums text-accent-foreground">
              {selectionCount} selected
            </span>
            {/* Same affordance as a row's Move to Trash: bordered icon button
                with the destructive hover tone and a hover tooltip. */}
            <span className="group/action relative">
              <button
                type="button"
                aria-label="Move to Trash"
                onClick={() => onBatchTrash?.()}
                className="rounded-md border border-border/60 bg-card p-1.5 text-muted-foreground shadow-sm transition-all hover:border-[#a13836] hover:bg-[#3a1d23] hover:text-destructive"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
              <ActionTooltip label="Move to Trash" />
            </span>
          </span>
          {/* Matches the filter panel's "Clear" — a plain primary text link. */}
          <button
            type="button"
            onClick={() => onClearSelection?.()}
            className="text-xs text-primary transition-colors hover:text-primary/80"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
