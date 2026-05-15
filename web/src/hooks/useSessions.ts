import { useCallback, useEffect, useState } from "react";
import type { Session } from "@/types";

interface UseSessionsResult {
  sessions: Session[];
  loading: boolean;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  setTitle: (id: string, title: string) => Promise<void>;
}

function sortByUpdatedDesc(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/sessions?includeTrashed=true");
    const data = (await res.json()) as { sessions: Session[] };
    setSessions(sortByUpdatedDesc(data.sessions));
  }, []);

  useEffect(() => {
    fetchSessions()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchSessions]);

  const softDelete = useCallback(async (id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isDeleted: true } : s))
    );
    await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }, []);

  const restore = useCallback(async (id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isDeleted: false } : s))
    );
    await fetch(`/api/sessions/${encodeURIComponent(id)}/restore`, {
      method: "POST",
    });
  }, []);

  const setTitle = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (trimmed.length > 0) {
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s))
        );
      }
      await fetch(`/api/sessions/${encodeURIComponent(id)}/title`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (trimmed.length === 0) {
        await fetchSessions();
      }
    },
    [fetchSessions]
  );

  return { sessions, loading, softDelete, restore, setTitle };
}
