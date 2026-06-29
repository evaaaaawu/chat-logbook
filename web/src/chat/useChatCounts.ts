import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectCount } from "@/chat/projects/projectFacets";

// The filter panel's static, per-view counts (#131 Phase A). Server-derived so
// the paginated list need not hold every Chat to count from — the counts are
// the view's whole universe (main vs Trash) and do not move when a filter is
// selected.

/** Per-Tag count as the server aggregation returns it. */
export interface TagCount {
  tagId: string;
  count: number;
}

export interface ChatCounts {
  /** The unfiltered List count ("Chats N") for the view. */
  total: number;
  /** Per-Project facet counts; "" is the `(No project)` group. */
  projects: ProjectCount[];
  /** Per-Tag facet counts. */
  tags: TagCount[];
  /** How many Chats in the view hold zero Tags. */
  untagged: number;
}

const EMPTY_COUNTS: ChatCounts = {
  total: 0,
  projects: [],
  tags: [],
  untagged: 0,
};

// Mirrors the list hooks' cadence so facet counts track file-watcher ingestion
// without a manual reload.
const BACKGROUND_REFRESH_MS = 4000;

function countsUrl(mode: "main" | "trash"): string {
  return mode === "trash"
    ? "/api/chats/counts?includeTrashed=true"
    : "/api/chats/counts";
}

export interface UseChatCountsResult {
  counts: ChatCounts;
  /** Tag facet count for a Tag id; 0 when the view holds none. */
  tagCount: (tagId: string) => number;
  /** Re-read the counts now (after a user action that can move them). */
  reload: () => Promise<void>;
}

/**
 * Read the per-view facet + list counts from the server. Refetches when the
 * view (main vs Trash) changes and on a background interval; `reload` forces an
 * immediate re-read after an action (trash, restore, tag assign) that can shift
 * the counts.
 */
export function useChatCounts(mode: "main" | "trash"): UseChatCountsResult {
  const [counts, setCounts] = useState<ChatCounts>(EMPTY_COUNTS);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(countsUrl(mode));
      if (!res.ok) return;
      const data = (await res.json()) as Partial<ChatCounts>;
      setCounts({
        total: data.total ?? 0,
        projects: data.projects ?? [],
        tags: data.tags ?? [],
        untagged: data.untagged ?? 0,
      });
    } catch {
      // Ignore transient failures; the next interval tick retries.
    }
  }, [mode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      void refresh();
    }, BACKGROUND_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const tagCountById = useMemo(
    () => new Map(counts.tags.map((t) => [t.tagId, t.count])),
    [counts.tags]
  );
  const tagCount = useCallback(
    (tagId: string) => tagCountById.get(tagId) ?? 0,
    [tagCountById]
  );

  return { counts, tagCount, reload: refresh };
}
