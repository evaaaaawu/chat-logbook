import { useEffect, useState } from "react";
import type { Session } from "@/types";

export function useSessions(): { sessions: Session[]; loading: boolean } {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
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

  return { sessions, loading };
}
