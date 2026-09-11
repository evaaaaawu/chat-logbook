import { useCallback, useEffect, useState } from "react";
import type { Tag } from "@/types";
import { fetchJson } from "@/api/fetchJson";
import { parseTag, parseTags, parseTagsByChat } from "@/api/parse";
import type { ColorToken } from "@/tags/palette";
import type { BatchTarget } from "@/chat/batchTarget";

interface UseTagsOptions {
  // Called after an assignment changes which tags a chat carries, so the chat
  // list can re-pull and re-render its chips/dots.
  onAssignmentChange: () => void;
}

export interface UseTagsResult {
  /** The full Tag catalog — drives the management section and the find-or-create
   * popover's option list. */
  tags: Tag[];
  createTag: (name: string, color: ColorToken) => Promise<Tag | null>;
  renameTag: (id: string, name: string) => Promise<void>;
  recolorTag: (id: string, color: ColorToken) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  assignTag: (chatId: string, tagId: string) => Promise<void>;
  removeTag: (chatId: string, tagId: string) => Promise<void>;
  /** Apply a staged add/remove Tag diff across a batch target in one call — the
   * checked ids (#163) or the live filter minus exclusions (#164, ADR-0021). */
  assignTagsBatch: (
    target: BatchTarget,
    diff: { add: string[]; remove: string[] }
  ) => Promise<void>;
  /** Tags grouped across a set of Chats in one query, keyed by chat id — feeds
   * the batch dialog's tri-state derivation (#163). */
  fetchTagsByChat: (chatIds: string[]) => Promise<Record<string, Tag[]>>;
}

// null when the catalog could not be read; callers keep the last-known value.
function fetchTags(): Promise<Tag[] | null> {
  return fetchJson("/api/tags", parseTags);
}

export function useTags({ onAssignmentChange }: UseTagsOptions): UseTagsResult {
  const [tags, setTags] = useState<Tag[]>([]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchTags();
      if (next) setTags(next);
    } catch {
      // Ignore transient failures; the catalog stays at its last-known value.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTags()
      .then((next) => {
        if (!cancelled && next) setTags(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const createTag = useCallback(
    async (name: string, color: ColorToken) => {
      const tag = await fetchJson("/api/tags", parseTag, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!tag) return null;
      await refresh();
      return tag;
    },
    [refresh]
  );

  const renameTag = useCallback(
    async (id: string, name: string) => {
      await fetch(`/api/tags/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await refresh();
      onAssignmentChange();
    },
    [refresh, onAssignmentChange]
  );

  const recolorTag = useCallback(
    async (id: string, color: ColorToken) => {
      await fetch(`/api/tags/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ color }),
      });
      await refresh();
      onAssignmentChange();
    },
    [refresh, onAssignmentChange]
  );

  const deleteTag = useCallback(
    async (id: string) => {
      await fetch(`/api/tags/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
      onAssignmentChange();
    },
    [refresh, onAssignmentChange]
  );

  const assignTag = useCallback(
    async (chatId: string, tagId: string) => {
      await fetch(`/api/chats/${encodeURIComponent(chatId)}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      onAssignmentChange();
    },
    [onAssignmentChange]
  );

  const removeTag = useCallback(
    async (chatId: string, tagId: string) => {
      await fetch(
        `/api/chats/${encodeURIComponent(chatId)}/tags/${encodeURIComponent(tagId)}`,
        { method: "DELETE" }
      );
      onAssignmentChange();
    },
    [onAssignmentChange]
  );

  const assignTagsBatch = useCallback(
    async (target: BatchTarget, diff: { add: string[]; remove: string[] }) => {
      // POST only: the batch caller (App) orchestrates the follow-up itself —
      // the drop-reconcile reload (#176), facet counts, and pruning the
      // Selection by the exact ids that left the list — so it needs the reload's
      // dropped-id result, which the shared onAssignmentChange discards. The
      // target doubles as the request body (explicit ids or filter branch).
      await fetch("/api/chats/batch/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...target, add: diff.add, remove: diff.remove }),
      });
    },
    []
  );

  const fetchTagsByChat = useCallback(
    async (chatIds: string[]): Promise<Record<string, Tag[]>> => {
      const byChat = await fetchJson(
        "/api/chats/batch/tags-by-chat",
        parseTagsByChat,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chatIds }),
        }
      );
      return byChat ?? {};
    },
    []
  );

  return {
    tags,
    createTag,
    renameTag,
    recolorTag,
    deleteTag,
    assignTag,
    removeTag,
    assignTagsBatch,
    fetchTagsByChat,
  };
}
