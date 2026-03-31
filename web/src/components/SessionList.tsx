import type { Session } from "@/types";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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

export function SessionList({
  sessions,
  selectedId,
  onSelect,
}: SessionListProps) {
  return (
    <div
      data-testid="session-list"
      className="flex h-full flex-col overflow-y-auto"
    >
      <div className="border-b border-border px-4 py-3 text-sm font-medium text-muted-foreground">
        {sessions.length} sessions
      </div>
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => onSelect(session.id)}
          className={`flex flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-card ${
            session.id === selectedId
              ? "border-l-2 border-l-primary bg-card"
              : "border-l-2 border-l-transparent"
          }`}
        >
          <span className="truncate text-sm font-medium text-accent-foreground">
            {session.title}
          </span>
          <span className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{getProjectName(session.project)}</span>
            <span className="ml-2 shrink-0">
              {getRelativeTime(session.updatedAt)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
