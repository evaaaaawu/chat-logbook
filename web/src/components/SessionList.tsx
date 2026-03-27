import type { Session } from "@/types";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
}: SessionListProps) {
  return (
    <div>
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => onSelect(session.id)}
          className={session.id === selectedId ? "selected" : ""}
        >
          <span>{session.title}</span>
        </button>
      ))}
    </div>
  );
}
