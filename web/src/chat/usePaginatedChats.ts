import { useCallback, useEffect, useRef, useState } from "react";
import type { Chat } from "@/types";
import { useChatMutations, type ChatListSource } from "@/chat/useChatMutations";

// The two time axes the keyset page endpoint supports (#129 / ADR-0017). Title
// and ascending time stay on the full-load client path, so they never reach here.
export type ListSort = "createdAt" | "updatedAt";

const DEFAULT_PAGE_SIZE = 30;

// The keyset endpoint rejects a `limit` over this cap (backend MAX_PAGE_LIMIT,
// #142). The window can grow past it via loadMore, so any window-sized request
// must clamp to it — otherwise the server returns 400 and the response carries
// no `chats`.
const MAX_PAGE_LIMIT = 200;

// How often the loaded window re-reads from the server, so file-watcher
// ingestion (new chats, bumped timestamps) shows up without a manual reload.
// Mirrors the full-load path's cadence (see useChats).
const BACKGROUND_REFRESH_MS = 4000;

// Merge a freshly-fetched window into the loaded one: refresh fields for chats
// the server still returns, keep loaded chats the refetch no longer covers (the
// window only grows under a background refresh — rows never vanish), and append
// brand-new chats. Ordering is left to the frozen-sort layer.
function mergeWindow(loaded: Chat[], incoming: Chat[]): Chat[] {
  const incomingById = new Map(incoming.map((c) => [c.id, c]));
  const loadedIds = new Set(loaded.map((c) => c.id));
  const merged = loaded.map((c) => incomingById.get(c.id) ?? c);
  const added = incoming.filter((c) => !loadedIds.has(c.id));
  return [...merged, ...added];
}

interface UsePaginatedChatsOptions {
  /** Page size for the keyset `limit`. */
  pageSize?: number;
  // Active only when the main view sorts by a descending time axis. When off,
  // the hook holds an empty window and issues no requests (the full-load path
  // is serving instead).
  enabled?: boolean;
}

// Adds the window-reconciling background refresh to the shared source shape; the
// refresh is exposed so the interval and tests can drive it directly.
type UsePaginatedChatsResult = ChatListSource & {
  refresh: () => Promise<void>;
};

interface PageResponse {
  chats: Chat[];
  nextCursor: string | null;
}

function pageUrl(sort: ListSort, limit: number, cursor?: string): string {
  const base = `/api/chats?sort=${sort}&limit=${limit}`;
  return cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
}

// Fetch one page, returning null on any failure (non-OK status, network error,
// or a body without a `chats` array) so callers never feed `undefined` into the
// window. A rejected request (e.g. limit over the cap) is a no-op, not a crash.
async function fetchPage(url: string): Promise<PageResponse | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<PageResponse>;
    if (!Array.isArray(data.chats)) return null;
    return { chats: data.chats, nextCursor: data.nextCursor ?? null };
  } catch {
    return null;
  }
}

// Owns the paginated chat-list read path: first page on mount plus a keyset
// cursor for fetching more. Used only when the main view sorts by a time axis
// descending; every other case stays on the full-load `useChats` path.
export function usePaginatedChats(
  sort: ListSort,
  {
    pageSize = DEFAULT_PAGE_SIZE,
    enabled = true,
  }: UsePaginatedChatsOptions = {}
): UsePaginatedChatsResult {
  const [chats, setChats] = useState<Chat[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortEpoch, setSortEpoch] = useState(0);
  const bumpEpoch = useCallback(() => setSortEpoch((e) => e + 1), []);

  // The cursor is read inside loadMore, which is called from event handlers that
  // close over a stale render. A ref keeps the live cursor without re-creating
  // the callback. `fetching` guards against overlapping page fetches (e.g. a
  // near-bottom detector firing twice before the next page resolves).
  const cursorRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  // The live window, read by refresh (called from an interval / event handler
  // that closes over a stale render) to size the refetch and merge into. Synced
  // after commit — refresh only ever runs post-render, so it sees the latest.
  const chatsRef = useRef<Chat[]>(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  // (Re)load the first page whenever the sort axis changes or the hook is
  // enabled — resetting the window so the new axis re-anchors from its top.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    cursorRef.current = null;
    fetchingRef.current = true;
    void fetchPage(pageUrl(sort, pageSize)).then((data) => {
      if (cancelled) return;
      if (data) {
        setChats(data.chats);
        setNextCursor(data.nextCursor);
        cursorRef.current = data.nextCursor;
      }
      fetchingRef.current = false;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sort, pageSize, enabled]);

  const loadMore = useCallback(() => {
    if (fetchingRef.current || cursorRef.current === null) return;
    const cursor = cursorRef.current;
    fetchingRef.current = true;
    void fetchPage(pageUrl(sort, pageSize, cursor)).then((data) => {
      if (data) {
        setChats((prev) => [...prev, ...data.chats]);
        setNextCursor(data.nextCursor);
        cursorRef.current = data.nextCursor;
      }
      fetchingRef.current = false;
    });
  }, [sort, pageSize]);

  // Re-read the top of the loaded window. Sized to the current window so a
  // brand-new chat ranking into it is surfaced, but clamped to the page-limit
  // cap so a large window never asks for more than the endpoint allows. Merged
  // so existing rows keep their place; the downward cursor is left untouched —
  // refresh reconciles the window's head, loadMore continues from its tail.
  const refresh = useCallback(async () => {
    const limit = Math.min(
      Math.max(chatsRef.current.length, pageSize),
      MAX_PAGE_LIMIT
    );
    const data = await fetchPage(pageUrl(sort, limit));
    if (data) setChats((prev) => mergeWindow(prev, data.chats));
  }, [sort, pageSize]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void refresh();
    }, BACKGROUND_REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  // A user-initiated reload: reconcile the window, then re-anchor the order.
  const reload = useCallback(async () => {
    await refresh();
    bumpEpoch();
  }, [refresh, bumpEpoch]);

  const { softDelete, restore, setTitle } = useChatMutations(
    setChats,
    bumpEpoch,
    reload
  );

  return {
    chats,
    loading: enabled ? loading : false,
    sortEpoch,
    hasMore: nextCursor !== null,
    loadMore,
    reload,
    refresh,
    softDelete,
    restore,
    setTitle,
  };
}
