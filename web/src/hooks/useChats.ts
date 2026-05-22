import { useCallback, useEffect, useState } from "react";
import type { Chat } from "@/types";

interface UseChatsResult {
  chats: Chat[];
  loading: boolean;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  setTitle: (id: string, title: string) => Promise<void>;
}

export function useChats(): UseChatsResult {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChats = useCallback(async () => {
    const res = await fetch("/api/chats?includeTrashed=true");
    const data = (await res.json()) as { chats: Chat[] };
    setChats(data.chats);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chats?includeTrashed=true")
      .then((res) => res.json() as Promise<{ chats: Chat[] }>)
      .then((data) => {
        if (!cancelled) setChats(data.chats);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const softDelete = useCallback(async (id: string) => {
    // Mirror the server contract optimistically so the Trash view sorts by a
    // real Deleted time immediately, before any refetch.
    const now = Date.now();
    setChats((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, isDeleted: true, deletedAt: now } : c
      )
    );
    await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }, []);

  const restore = useCallback(async (id: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, isDeleted: false, deletedAt: null } : c
      )
    );
    await fetch(`/api/chats/${encodeURIComponent(id)}/restore`, {
      method: "POST",
    });
  }, []);

  const setTitle = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (trimmed.length > 0) {
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
        );
      }
      await fetch(`/api/chats/${encodeURIComponent(id)}/title`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (trimmed.length === 0) {
        await fetchChats();
      }
    },
    [fetchChats]
  );

  return { chats, loading, softDelete, restore, setTitle };
}
