import { useCallback, useEffect, useState } from "react";
import type { Chat } from "@/types";

// How often the UI re-reads the chat list while running, so file-watcher
// ingestion (new chats, bumped `updatedAt`) shows up without a manual reload.
// These background refreshes deliberately do NOT bump `sortEpoch`, so the sort
// order stays frozen under the user until they next act on it (see App).
const BACKGROUND_REFRESH_MS = 4000;

interface UseChatsResult {
  chats: Chat[];
  loading: boolean;
  // Increments on user-initiated changes (rename, delete, restore) only.
  // Background refreshes leave it untouched. App keys its frozen sort order on
  // this so background updates never re-sort the list under the user.
  sortEpoch: number;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  setTitle: (id: string, title: string) => Promise<void>;
  // Re-pull the list and re-sort. Used after a tag assignment changes the
  // chips/dots a chat shows, so the change lands without waiting for the
  // background refresh interval.
  reload: () => Promise<void>;
}

export function useChats(): UseChatsResult {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortEpoch, setSortEpoch] = useState(0);

  const bumpEpoch = useCallback(() => setSortEpoch((e) => e + 1), []);

  // A background refresh: pull the latest list but leave sortEpoch alone, so the
  // frozen order holds.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/chats?includeTrashed=true");
      const data = (await res.json()) as { chats: Chat[] };
      setChats(data.chats);
    } catch {
      // Ignore transient failures; the next interval tick retries.
    }
  }, []);

  // A user-initiated refresh: same fetch, but re-sort afterwards.
  const reload = useCallback(async () => {
    await refresh();
    bumpEpoch();
  }, [refresh, bumpEpoch]);

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

  useEffect(() => {
    const id = setInterval(() => {
      void refresh();
    }, BACKGROUND_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const softDelete = useCallback(
    async (id: string) => {
      // Mirror the server contract optimistically so the Trash view sorts by a
      // real Deleted time immediately, before any refetch.
      const now = Date.now();
      setChats((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, isDeleted: true, deletedAt: now } : c
        )
      );
      bumpEpoch();
      await fetch(`/api/chats/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    [bumpEpoch]
  );

  const restore = useCallback(
    async (id: string) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, isDeleted: false, deletedAt: null } : c
        )
      );
      bumpEpoch();
      await fetch(`/api/chats/${encodeURIComponent(id)}/restore`, {
        method: "POST",
      });
    },
    [bumpEpoch]
  );

  const setTitle = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (trimmed.length > 0) {
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
        );
        bumpEpoch();
      }
      await fetch(`/api/chats/${encodeURIComponent(id)}/title`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (trimmed.length === 0) {
        await reload();
      }
    },
    [bumpEpoch, reload]
  );

  return { chats, loading, sortEpoch, softDelete, restore, setTitle, reload };
}
