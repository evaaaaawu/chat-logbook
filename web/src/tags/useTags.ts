import { useCallback, useEffect, useState } from "react";
import type { Tag } from "@/types";
import type { ColorToken } from "@/tags/palette";

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
}

async function fetchTags(): Promise<Tag[]> {
  const res = await fetch("/api/tags");
  const data = (await res.json()) as { tags: Tag[] };
  return data.tags;
}

export function useTags({ onAssignmentChange }: UseTagsOptions): UseTagsResult {
  const [tags, setTags] = useState<Tag[]>([]);

  const refresh = useCallback(async () => {
    try {
      setTags(await fetchTags());
    } catch {
      // Ignore transient failures; the catalog stays at its last-known value.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTags()
      .then((next) => {
        if (!cancelled) setTags(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const createTag = useCallback(
    async (name: string, color: ColorToken) => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) return null;
      const { tag } = (await res.json()) as { tag: Tag };
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

  return {
    tags,
    createTag,
    renameTag,
    recolorTag,
    deleteTag,
    assignTag,
    removeTag,
  };
}
