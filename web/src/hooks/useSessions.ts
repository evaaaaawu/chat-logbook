import { useCallback, useEffect, useState } from "react";
import type { Session } from "@/types";

interface UseSessionsResult {
  sessions: Session[];
  loading: boolean;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
}

export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions?includeTrashed=true")
      .then((res) => res.json())
      .then((data: { sessions: Session[] }) => {
        const sorted = [...data.sessions].sort(
          (a, b) => b.updatedAt - a.updatedAt
        );
        setSessions(sorted);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

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

  return { sessions, loading, softDelete, restore };
}
