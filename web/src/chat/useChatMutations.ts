import { useCallback } from "react";
import type { Chat } from "@/types";

export interface ChatMutations {
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  setTitle: (id: string, title: string) => Promise<void>;
  // Batch Move to Trash / Restore over the Selection (#161). Each applies one
  // optimistic pass over the id set — so the trashed rows leave (or return to)
  // the list at once — then fires a single batch request (ADR-0021 explicit-ids
  // branch). The optimistic pass is what removes the rows: the window refresh
  // only grows, never drops, so a reload alone would keep the trashed rows.
  softDeleteBatch: (ids: string[]) => Promise<void>;
  restoreBatch: (ids: string[]) => Promise<void>;
}

// The shared shape both chat-list read hooks expose: the loaded chats plus the
// windowing controls and write actions. App picks one source (full-load or
// paginated) by mode and treats them interchangeably through this interface.
export interface ChatListSource extends ChatMutations {
  chats: Chat[];
  loading: boolean;
  // Increments on user-initiated changes (rename, delete, restore) only, so the
  // frozen order re-anchors on a real action but holds under background refresh.
  sortEpoch: number;
  // True while a further page can be fetched (always false on the full path).
  hasMore: boolean;
  // Fetch the next page (a no-op on the full path).
  loadMore: () => void;
  // True while a page evicted above the bounded window can be re-fetched on
  // scroll-back (#132). Always false on the full path and at the list head.
  hasPrevious: boolean;
  // Re-fetch the page just above the window and prepend it, evicting the
  // far-below page to stay bounded (a no-op on the full path / at the head).
  loadPrevious: () => void;
  // Re-read and re-sort the loaded chats (used after a tag assignment changes
  // the chips a chat shows). Resolves with the ids that left the list, so a
  // caller can reconcile derived state (e.g. prune a Selection) by exact id.
  reload: () => Promise<string[]>;
}

// The chat write actions (trash / restore / rename), shared by both the
// full-load and paginated read hooks. Each applies the same optimistic local
// update — so the UI reflects the change before the server round-trip — then
// bumps the sort epoch to flush the frozen order, mirroring the server
// contract. The caller supplies the state updater, the epoch bump, and the
// reload used to recover when a rename is cleared to empty.
export function useChatMutations(
  setChats: (updater: (prev: Chat[]) => Chat[]) => void,
  bumpEpoch: () => void,
  reload: () => Promise<string[]>
): ChatMutations {
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
      await fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    [setChats, bumpEpoch]
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
    [setChats, bumpEpoch]
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
    [setChats, bumpEpoch, reload]
  );

  const softDeleteBatch = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const now = Date.now();
      setChats((prev) =>
        prev.map((c) =>
          idSet.has(c.id) ? { ...c, isDeleted: true, deletedAt: now } : c
        )
      );
      bumpEpoch();
      await fetch("/api/chats/batch/trash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatIds: ids }),
      });
    },
    [setChats, bumpEpoch]
  );

  const restoreBatch = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setChats((prev) =>
        prev.map((c) =>
          idSet.has(c.id) ? { ...c, isDeleted: false, deletedAt: null } : c
        )
      );
      bumpEpoch();
      await fetch("/api/chats/batch/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatIds: ids }),
      });
    },
    [setChats, bumpEpoch]
  );

  return { softDelete, restore, setTitle, softDeleteBatch, restoreBatch };
}
