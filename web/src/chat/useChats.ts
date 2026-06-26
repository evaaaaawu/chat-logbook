import { useCallback, useEffect, useState } from "react";
import type { Chat } from "@/types";
import { useChatMutations, type ChatListSource } from "@/chat/useChatMutations";

// How often the UI re-reads the chat list while running, so file-watcher
// ingestion (new chats, bumped `updatedAt`) shows up without a manual reload.
// These background refreshes deliberately do NOT bump `sortEpoch`, so the sort
// order stays frozen under the user until they next act on it (see App).
const BACKGROUND_REFRESH_MS = 4000;

interface UseChatsOptions {
  // The full-load path backs the Trash view, the Title sort, and ascending time
  // sorts. The main view's descending time sorts page server-side instead, so
  // this hook is disabled then to honor "no longer pulling all Chats" (#129).
  enabled?: boolean;
}

// The full-list read path: pulls every chat (active + trashed) in one request
// and refreshes on an interval. Used wherever pagination does not apply.
export function useChats({
  enabled = true,
}: UseChatsOptions = {}): ChatListSource {
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
    if (!enabled) return;
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void refresh();
    }, BACKGROUND_REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const { softDelete, restore, setTitle } = useChatMutations(
    setChats,
    bumpEpoch,
    reload
  );

  return {
    chats,
    // While disabled the hook neither fetches nor owns a meaningful loading
    // state, so report "settled" rather than touching state from an effect.
    loading: enabled ? loading : false,
    sortEpoch,
    hasMore: false,
    loadMore: () => {},
    reload,
    softDelete,
    restore,
    setTitle,
  };
}
