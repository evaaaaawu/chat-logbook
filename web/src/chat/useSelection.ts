import { useCallback, useState } from "react";

interface UseSelectionParams {
  /**
   * The visible chat ids in list order. Range selection (`Shift+click`) walks
   * this to fill the span between the anchor and the target, so it must reflect
   * the same order the rows render in.
   */
  orderedIds: string[];
  /**
   * The Open Chat id — the primary member of the Selection. On a filter/view
   * reset the Selection re-seeds to just this, so opening one Chat and then
   * marking more always keeps the primary in the set.
   */
  primaryId: string | null;
  /**
   * Identity of the current filter + view. The Selection collapses to the
   * primary whenever this changes (filter change, view switch) and survives when
   * it holds steady (sort change, background refresh) — see CONTEXT.md, #161.
   */
  resetKey: string;
}

export interface Selection {
  /** The set of Chats marked for a batch action; always includes the primary. */
  selectedIds: ReadonlySet<string>;
  /** Plain click / open: collapse the Selection to just this Chat. */
  selectOnly: (id: string) => void;
  /** `Cmd`/`Ctrl`+click: flip one id's membership (the deselect-one gesture). */
  toggle: (id: string) => void;
  /**
   * `Shift`+click: the inclusive span from `anchorId` to `targetId` in list
   * order. `additive` (`Cmd/Ctrl+Shift`) unions it with the current Selection;
   * otherwise it replaces the rest, keeping only the span. With no anchor it
   * collapses to the target.
   */
  selectRange: (
    anchorId: string | null,
    targetId: string,
    additive: boolean
  ) => void;
  /** Drop every id. */
  clear: () => void;
}

/**
 * The Selection: the set of Chats marked to act on together, with the Open Chat
 * as its primary member (see CONTEXT.md). An id set, so it rides sort changes
 * and background refreshes; on a filter/view change it re-seeds to the primary.
 */
export function useSelection({
  orderedIds,
  primaryId,
  resetKey,
}: UseSelectionParams): Selection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() =>
    primaryId ? new Set([primaryId]) : new Set()
  );

  // Collapse to the primary on filter/view change without an effect: adjusting
  // state during render on a changed prop is the sanctioned React pattern. Sort
  // and refresh never change resetKey, so the Selection survives them.
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setSelectedIds(primaryId ? new Set([primaryId]) : new Set());
  }

  const selectOnly = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectRange = useCallback(
    (anchorId: string | null, targetId: string, additive: boolean) => {
      if (anchorId === null) {
        setSelectedIds(new Set([targetId]));
        return;
      }
      const from = orderedIds.indexOf(anchorId);
      const to = orderedIds.indexOf(targetId);
      if (from === -1 || to === -1) return;
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      const range = orderedIds.slice(lo, hi + 1);
      setSelectedIds((prev) =>
        additive ? new Set([...prev, ...range]) : new Set(range)
      );
    },
    [orderedIds]
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return { selectedIds, selectOnly, toggle, selectRange, clear };
}
