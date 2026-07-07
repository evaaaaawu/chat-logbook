import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_PAGE_LIMIT } from "@contract";
import type { Chat } from "@/types";
import { useChatMutations, type ChatListSource } from "@/chat/useChatMutations";
import { useListStream, type ListStreamConnector } from "@/chat/useListStream";
import type { TagMode } from "@/tags/tagModePreference";

// The sort axes the keyset page endpoint supports. createdAt/updatedAt are the
// main view's time axes (#129 / ADR-0017); deletedAt is the Trash view's
// deleted-time axis (#145), valid only alongside `trashedOnly`; title sorts
// through the precomputed collation key (#146 / ADR-0019), in both views. Every
// axis now pages server-side — there is no full-load fallback (ADR-0018).
export type ListSort = "createdAt" | "updatedAt" | "deletedAt" | "title";

// Both directions of each time axis page server-side (#143): the covering keyset
// index scans either way, so "Oldest first" no longer falls back to full-load.
export type ListDirection = "asc" | "desc";

const DEFAULT_PAGE_SIZE = 30;

// Cap on how many pages the loaded window holds. Past this, scrolling further
// evicts the far-offscreen page at the opposite end; scrolling back re-fetches
// it via its cursor. This bounds memory and the frozen-sort layer's per-render
// re-sort cost at scale (~50,000 Chats), where an unbounded window grew both
// without limit (#132 / ADR-0018, ADR-0020). 8 pages comfortably exceeds a
// viewport-plus-overscan worth of rows at the default page size.
const DEFAULT_MAX_WINDOW_PAGES = 8;

// One fetched page held in the loaded window, tagged with the cursors that
// bound it: `fromCursor` is the keyset cursor that fetched this page (null for
// the list head), so an evicted page can be re-fetched on scroll-back;
// `nextCursor` fetches the page below it (null at the list tail).
interface LoadedPage {
  fromCursor: string | null;
  nextCursor: string | null;
  chats: Chat[];
}

// The keyset endpoint rejects a `limit` over MAX_PAGE_LIMIT (the shared cap in
// `@contract`). The window can grow past it via loadMore, so any window-sized
// request must clamp to it — otherwise the server returns 400 and the response
// carries no `chats` (the blank-screen crash fixed in #147).

// The loaded window now reconciles on a server push the instant ingestion
// settles (#132 / ADR-0020). This interval is only a floor: a low-frequency
// reconcile that catches a change missed during a stream reconnect gap, so the
// window can never stay stale indefinitely even if a push is lost.
const RECONCILE_FLOOR_MS = 30000;

interface UsePaginatedChatsOptions {
  /** Page size for the keyset `limit`. */
  pageSize?: number;
  /**
   * Cap on the loaded window's page count (#132). Past this, `loadMore` evicts
   * the oldest page and `loadPrevious` evicts the newest, keeping the window
   * bounded. Injectable so tests can drive eviction with a small window;
   * defaults to {@link DEFAULT_MAX_WINDOW_PAGES}.
   */
  maxWindowPages?: number;
  // Active only when the main view sorts by a descending time axis. When off,
  // the hook holds an empty window and issues no requests (the full-load path
  // is serving instead).
  enabled?: boolean;
  /**
   * Active Project filter (OR / union), sent to the keyset query so filtering
   * pages server-side (#130). An empty array leaves Projects unfiltered. The
   * loaded window re-anchors (refetches the first page) whenever this changes.
   */
  projects?: readonly string[];
  /**
   * Active Tag filter (AND / intersection). The empty-string entry selects the
   * Untagged group. An empty array leaves Tags unfiltered. Re-anchors on change.
   */
  tags?: readonly string[];
  /**
   * How the selected real Tags combine (ADR-0016 update): `all` (default) ANDs
   * them, `any` ORs them and lets the Untagged group join the union. Rides the
   * page request as `tagMode=any` only when active; re-anchors on change.
   */
  tagMode?: TagMode;
  /**
   * Trash view scope (#145): when true the page is trashed-only, the inverse of
   * the default active list. Pairs with the `deletedAt` sort axis but also
   * scopes the time axes within Trash. Sent to the keyset query as
   * `trashedOnly=true`.
   */
  trashedOnly?: boolean;
  /**
   * Live-update stream connector (#132), injected for testing and to let the
   * transport be swapped. Defaults to the Server-Sent Events connector inside
   * {@link useListStream}.
   */
  connect?: ListStreamConnector;
}

/** The active list filter sent to the keyset query alongside sort + cursor. */
interface ActiveFilter {
  projects: readonly string[];
  tags: readonly string[];
  tagMode: TagMode;
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

function pageUrl(
  sort: ListSort,
  direction: ListDirection,
  limit: number,
  filter: ActiveFilter,
  trashedOnly: boolean,
  cursor?: string
): string {
  let base = `/api/chats?sort=${sort}&direction=${direction}&limit=${limit}`;
  // The Trash view scopes the page to soft-deleted chats only (#145).
  if (trashedOnly) base += `&trashedOnly=true`;
  // Repeated `?project=` unions (OR); a single comma-separated `?tags=` ANDs.
  // An empty-string entry rides through as `?project=` / `?tags=`, selecting the
  // (No project) / Untagged group — the same wire form the server parses (#130).
  for (const project of filter.projects) {
    base += `&project=${encodeURIComponent(project)}`;
  }
  if (filter.tags.length > 0) {
    base += `&tags=${filter.tags.map(encodeURIComponent).join(",")}`;
  }
  // `tagMode=any` opts into OR; `all` is the server default, so it rides only
  // when active — keeping the default request URL unchanged.
  if (filter.tagMode === "any") base += `&tagMode=any`;
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
// cursor for fetching more. The single read path for every axis and both views
// (ADR-0018) — main and Trash, time axes, Title, in either direction.
export function usePaginatedChats(
  sort: ListSort,
  direction: ListDirection,
  {
    pageSize = DEFAULT_PAGE_SIZE,
    maxWindowPages = DEFAULT_MAX_WINDOW_PAGES,
    enabled = true,
    projects = [],
    tags = [],
    tagMode = "all",
    trashedOnly = false,
    connect,
  }: UsePaginatedChatsOptions = {}
): UsePaginatedChatsResult {
  // The selection arrays change identity every render (App spreads a Set), so a
  // canonical JSON key drives the effect/callback deps — a re-anchor fires only
  // when the selection's contents actually change, not on every render. The
  // memoized filter object is rebuilt from the keys, giving the fetch sites one
  // stable reference per distinct selection.
  const projectsKey = JSON.stringify([...projects].sort());
  const tagsKey = JSON.stringify([...tags].sort());
  const filter = useMemo<ActiveFilter>(
    () => ({
      projects: JSON.parse(projectsKey) as string[],
      tags: JSON.parse(tagsKey) as string[],
      tagMode,
    }),
    [projectsKey, tagsKey, tagMode]
  );

  // The loaded window is a list of fetched pages, each carrying the cursors that
  // bound it (#132). The outward `chats` is their concatenation; holding pages
  // (not a flat array) lets the window evict and re-fetch by page at its edges.
  const [pages, setPages] = useState<LoadedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortEpoch, setSortEpoch] = useState(0);
  const bumpEpoch = useCallback(() => setSortEpoch((e) => e + 1), []);

  const chats = useMemo(() => pages.flatMap((p) => p.chats), [pages]);

  // `fetching` guards against overlapping page fetches (e.g. a near-bottom
  // detector firing twice before the next page resolves). `pagesRef` keeps the
  // live window for callbacks (loadMore / loadPrevious / refresh) that run from
  // event handlers or intervals closing over a stale render.
  const fetchingRef = useRef(false);
  const pagesRef = useRef<LoadedPage[]>(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  // `fromCursor`s of pages evicted above the window, oldest-first. loadPrevious
  // pops the last (the page just above the current top) to re-fetch it on
  // scroll-back. Reset whenever the window re-anchors (#132).
  const evictedAboveRef = useRef<(string | null)[]>([]);

  // (Re)load the first page whenever the sort axis, the active filter, or the
  // enabled flag changes — resetting the window so the new axis or filter
  // re-anchors from its top (#130). The fresh window is a single head page
  // (`fromCursor: null`), from which loadMore grows downward.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchingRef.current = true;
    void fetchPage(
      pageUrl(sort, direction, pageSize, filter, trashedOnly)
    ).then((data) => {
      if (cancelled) return;
      if (data) {
        evictedAboveRef.current = [];
        setPages([
          { fromCursor: null, nextCursor: data.nextCursor, chats: data.chats },
        ]);
      }
      fetchingRef.current = false;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sort, direction, pageSize, enabled, filter, trashedOnly]);

  const loadMore = useCallback(() => {
    if (fetchingRef.current) return;
    const prev = pagesRef.current;
    const tail = prev[prev.length - 1];
    if (!tail || tail.nextCursor === null) return;
    const cursor = tail.nextCursor;
    fetchingRef.current = true;
    void fetchPage(
      pageUrl(sort, direction, pageSize, filter, trashedOnly, cursor)
    ).then((data) => {
      if (data) {
        const grown = [
          ...pagesRef.current,
          {
            fromCursor: cursor,
            nextCursor: data.nextCursor,
            chats: data.chats,
          },
        ];
        // Evict the oldest page(s) once the window passes the cap; they sit far
        // above the viewport. Stash their cursors so scroll-back can re-fetch.
        if (grown.length > maxWindowPages) {
          const evictCount = grown.length - maxWindowPages;
          evictedAboveRef.current = [
            ...evictedAboveRef.current,
            ...grown.slice(0, evictCount).map((p) => p.fromCursor),
          ];
          setPages(grown.slice(evictCount));
        } else {
          setPages(grown);
        }
      }
      fetchingRef.current = false;
    });
  }, [sort, direction, pageSize, filter, trashedOnly, maxWindowPages]);

  // Re-fetch the page just above the window and prepend it (scroll-back, #132),
  // evicting the far-below page to stay bounded. The cursor comes off the
  // evicted-above stack; loadMore can re-fetch the evicted-below page from the
  // new tail's cursor, so only the top end needs a stash.
  const loadPrevious = useCallback(() => {
    if (fetchingRef.current) return;
    const stack = evictedAboveRef.current;
    if (stack.length === 0) return;
    const cursor = stack[stack.length - 1];
    fetchingRef.current = true;
    void fetchPage(
      pageUrl(
        sort,
        direction,
        pageSize,
        filter,
        trashedOnly,
        cursor ?? undefined
      )
    ).then((data) => {
      if (data) {
        evictedAboveRef.current = evictedAboveRef.current.slice(0, -1);
        const grown = [
          {
            fromCursor: cursor,
            nextCursor: data.nextCursor,
            chats: data.chats,
          },
          ...pagesRef.current,
        ];
        setPages(
          grown.length > maxWindowPages ? grown.slice(0, maxWindowPages) : grown
        );
      }
      fetchingRef.current = false;
    });
  }, [sort, direction, pageSize, filter, trashedOnly, maxWindowPages]);

  // Re-read the head of the loaded window and reconcile it in place (live-update
  // path, #132). Only acts when the head page is still loaded: new Chats appear
  // at the list head (newest-first), so a window scrolled far past the head has
  // nothing at the top to reconcile, and re-reading the head there would fight
  // eviction. Sized to the loaded window but clamped to the page-limit cap so a
  // large window never asks for more than the endpoint allows (#147).
  const refresh = useCallback(async () => {
    const current = pagesRef.current;
    if (current.length === 0 || current[0].fromCursor !== null) return;
    const windowLen = current.reduce((n, p) => n + p.chats.length, 0);
    const limit = Math.min(Math.max(windowLen, pageSize), MAX_PAGE_LIMIT);
    const data = await fetchPage(
      pageUrl(sort, direction, limit, filter, trashedOnly)
    );
    if (!data) return;
    setPages((prev) => {
      if (prev.length === 0) return prev;
      const incomingById = new Map(data.chats.map((c) => [c.id, c]));
      const loadedIds = new Set(prev.flatMap((p) => p.chats).map((c) => c.id));
      // Refresh fields in place for chats the server still returns; keep loaded
      // rows the refetch no longer covers (the window only grows here).
      const updated = prev.map((p) => ({
        ...p,
        chats: p.chats.map((c) => incomingById.get(c.id) ?? c),
      }));
      // Brand-new chats now ranking into the window slot onto the head page, in
      // server order; the frozen-sort layer places them among the held rows.
      const added = data.chats.filter((c) => !loadedIds.has(c.id));
      if (added.length === 0) return updated;
      const [head, ...rest] = updated;
      return [{ ...head, chats: [...added, ...head.chats] }, ...rest];
    });
  }, [sort, direction, pageSize, filter, trashedOnly]);

  // Primary trigger: reconcile the window head on each server-pushed change, so
  // ingestion shows up the instant it settles instead of on a fixed poll
  // (#132 / ADR-0020). The connector is injectable for testing.
  useListStream(
    useCallback(() => {
      void refresh();
    }, [refresh]),
    { enabled, connect }
  );

  // Safety floor: a low-frequency reconcile catches a change missed during a
  // stream reconnect gap, so a lost push can never leave the window stale.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void refresh();
    }, RECONCILE_FLOOR_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  // A user-initiated reload: reconcile the window, then re-anchor the order.
  const reload = useCallback(async () => {
    await refresh();
    bumpEpoch();
  }, [refresh, bumpEpoch]);

  // Bridge the mutations' flat-list optimistic updates onto the page model.
  // Mutations only update fields or drop a row by id, so re-distributing the
  // transformed rows back into their pages by id keeps page boundaries — and
  // their cursors — intact.
  const setChats = useCallback((updater: (prev: Chat[]) => Chat[]) => {
    setPages((prev) => {
      const next = updater(prev.flatMap((p) => p.chats));
      const byId = new Map(next.map((c) => [c.id, c]));
      return prev.map((p) => ({
        ...p,
        chats: p.chats
          .filter((c) => byId.has(c.id))
          .map((c) => byId.get(c.id) as Chat),
      }));
    });
  }, []);

  const { softDelete, restore, setTitle, softDeleteBatch, restoreBatch } =
    useChatMutations(setChats, bumpEpoch, reload);

  const tail = pages[pages.length - 1];
  const head = pages[0];

  return {
    chats,
    loading: enabled ? loading : false,
    sortEpoch,
    hasMore: tail ? tail.nextCursor !== null : false,
    loadMore,
    // Content sits above the window only once its head page was evicted, which
    // leaves the top page tagged with the cursor that fetched it (#132).
    hasPrevious: head ? head.fromCursor !== null : false,
    loadPrevious,
    reload,
    refresh,
    softDelete,
    restore,
    setTitle,
    softDeleteBatch,
    restoreBatch,
  };
}
