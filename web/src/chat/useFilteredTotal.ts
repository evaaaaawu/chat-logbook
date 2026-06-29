import { useEffect, useState } from "react";

// The filtered List count ("Chats N" when a filter is active; #131 Phase B).
// Kept separate from the static facet counts (useChatCounts) so toggling a
// filter does not refetch the per-view facets — only this lean total refetches.
// Returns undefined when no filter is active, so the header falls back to the
// server's unfiltered facet total.

const BACKGROUND_REFRESH_MS = 4000;

function listTotalUrl(
  mode: "main" | "trash",
  projects: string[],
  tags: string[]
): string {
  const params = new URLSearchParams();
  if (mode === "trash") params.set("includeTrashed", "true");
  // Repeated `?project=` unions (OR); a single comma-separated `?tags=` ANDs —
  // the same wire shape the paginated list query uses (#130).
  for (const p of projects) params.append("project", p);
  if (tags.length > 0) params.set("tags", tags.join(","));
  return `/api/chats/list-total?${params.toString()}`;
}

/** A fetched total tagged with the URL that produced it. */
interface FetchedTotal {
  url: string;
  total: number;
}

/**
 * Read the server's post-filter List count for the active Project/Tag filter.
 * Refetches when the view or the filter changes and on a background interval to
 * track file-watcher ingestion. Returns undefined when nothing is filtered.
 *
 * Stale-while-revalidate: while the next filter's total is in flight it keeps
 * returning the last fetched total rather than dropping to undefined — that
 * would let the header momentarily fall back to the paginated window count (the
 * page size), flashing a wrong number before the real total lands (#131).
 */
export function useFilteredTotal(
  mode: "main" | "trash",
  projects: string[],
  tags: string[]
): number | undefined {
  const [fetched, setFetched] = useState<FetchedTotal | null>(null);
  // The URL fully encodes view + filter, so depending on it re-runs the fetch
  // exactly when the selection changes — no array-identity churn across renders.
  const active = projects.length > 0 || tags.length > 0;
  const url = active ? listTotalUrl(mode, projects, tags) : null;

  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { total?: number };
        if (!cancelled) setFetched({ url, total: data.total ?? 0 });
      } catch {
        // Ignore transient failures; the next interval tick retries.
      }
    };
    void refresh();
    const id = setInterval(() => void refresh(), BACKGROUND_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url]);

  // Nothing to show when no filter is active; otherwise surface the last fetched
  // total (the current filter's once it lands, the previous one's meanwhile).
  if (url === null) return undefined;
  return fetched?.total;
}
