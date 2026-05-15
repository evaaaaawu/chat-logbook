import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Session } from "@/types";
import { EditableTitle } from "./EditableTitle";

interface SessionListProps {
  mode?: "main" | "trash";
  sessions: Session[];
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
  sessionId: string;
  x: number;
  y: number;
}

const TITLE_DISPLAY_CLASS =
  "inline-block max-w-full truncate align-middle rounded px-1.5 py-0.5 -mx-1.5 text-sm font-medium text-accent-foreground cursor-text transition-colors group-hover:bg-white/[0.04]";
const TITLE_INPUT_CLASS =
  "min-w-[12ch] max-w-full rounded border border-border bg-transparent px-1.5 py-0.5 text-sm font-medium text-accent-foreground outline-none focus:border-primary [field-sizing:content]";

export function SessionList({
  mode = "main",
  sessions,
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
}: SessionListProps) {
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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  };

  return (
    <div data-testid="session-list" className="flex h-full flex-col">
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
              Trash ({sessions.length})
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold text-accent-foreground">
              Sessions
            </span>
            <span className="text-xs text-muted-foreground">
              {sessions.length}
            </span>
          </>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {isTrash ? (
              <>
                <div className="font-medium text-foreground">
                  Trash is empty
                </div>
                <div className="mt-1 text-xs">
                  Deleted sessions appear here. They stay until you restore
                  them.
                </div>
              </>
            ) : (
              <>
                <div className="font-medium text-foreground">No sessions</div>
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
          sessions.map((session) => {
            const isSelected = session.id === selectedId;
            const isEditing = editingId === session.id && !!onRenameTitle;
            const rowClassName = `flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-card ${
              isSelected
                ? "border-l-2 border-l-primary bg-card"
                : "border-l-2 border-l-transparent"
            }`;
            const titleNode =
              onRenameTitle && !isTrash ? (
                <EditableTitle
                  value={session.title}
                  editing={isEditing}
                  onEditStart={() => setEditingId(session.id)}
                  onEditEnd={() => setEditingId(null)}
                  onSave={(next) => onRenameTitle(session.id, next)}
                  onDisplayClick={(e) => {
                    if (isSelected) {
                      e.stopPropagation();
                    } else {
                      e.preventDefault();
                    }
                  }}
                  displayClassName={TITLE_DISPLAY_CLASS}
                  inputClassName={TITLE_INPUT_CLASS}
                  inputAriaLabel="Session title"
                />
              ) : (
                <span className={TITLE_DISPLAY_CLASS}>{session.title}</span>
              );
            const rowContent = (
              <>
                <div className="min-w-0">{titleNode}</div>
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    {getProjectName(session.project)}
                  </span>
                  <span className="ml-2 shrink-0">
                    {getRelativeTime(session.updatedAt)}
                  </span>
                </span>
              </>
            );
            return (
              <div
                key={session.id}
                data-testid="session-row"
                className="group relative"
                onContextMenu={(e) => handleContextMenu(e, session.id)}
              >
                {isEditing ? (
                  <div className={rowClassName}>{rowContent}</div>
                ) : (
                  <button
                    onClick={() => onSelect(session.id)}
                    className={rowClassName}
                  >
                    {rowContent}
                  </button>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  {isTrash && onRestore ? (
                    <button
                      type="button"
                      aria-label={`Restore session: ${session.title}`}
                      onClick={() => onRestore(session.id)}
                      className="rounded-md border border-border/60 bg-card p-1.5 text-muted-foreground opacity-0 shadow-sm transition-all hover:border-[#5f7a26] hover:bg-[#1f2e15] hover:text-[#859900] group-hover:opacity-100 focus:opacity-100"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    !isEditing && (
                      <button
                        type="button"
                        aria-label={`Delete session: ${session.title}`}
                        onClick={() => onDelete(session.id)}
                        className="rounded-md border border-border/60 bg-card p-1.5 text-muted-foreground opacity-0 shadow-sm transition-all hover:border-[#a13836] hover:bg-[#3a1d23] hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
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
          className="fixed z-50 min-w-[180px] rounded-md border border-border bg-card py-1 text-sm shadow-lg"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {!isTrash && onRenameTitle && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditingId(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <Pencil size={14} aria-hidden="true" />
                Rename
              </span>
              <span className="text-xs text-muted-foreground">F2</span>
            </button>
          )}
          {isTrash && onRestore ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRestore(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Restore session
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDelete(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-destructive transition-colors hover:bg-[#3a1d23]"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete session
            </button>
          )}
        </div>
      )}
    </div>
  );
}
