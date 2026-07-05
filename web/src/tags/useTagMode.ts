import { useCallback, useState } from "react";
import {
  loadTagMode,
  saveTagMode,
  type TagMode,
} from "@/tags/tagModePreference";

/**
 * Owns the Tag filter's Match mode for one view (ADR-0016 update), persisted per
 * view under its own storage key so a chosen `any` survives reloads and the main
 * and Trash views keep independent modes — the same shape as the per-view sort
 * preference. Returns the current mode and a setter that writes through.
 */
export function useTagMode(view: "main" | "trash"): {
  mode: TagMode;
  setMode: (mode: TagMode) => void;
} {
  const storageKey = `chat-logbook:tag-mode:${view}`;
  const [mode, setModeState] = useState<TagMode>(() => loadTagMode(storageKey));

  const setMode = useCallback(
    (next: TagMode) => {
      saveTagMode(storageKey, next);
      setModeState(next);
    },
    [storageKey]
  );

  return { mode, setMode };
}
