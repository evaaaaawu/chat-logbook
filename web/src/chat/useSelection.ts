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
  /**
   * How many Chats match the current filter across the whole store, not just the
   * loaded window (#131). Under select-all-matching the effective count is this
   * total minus the excluded rows; defaults to 0 when unknown.
   */
  filteredTotal?: number;
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
  /**
   * Remove specific ids from the Selection — used to prune members a
   * server-authoritative reload dropped from the list (e.g. a batch Tag change
   * moved them out of the active filter), so the Selection never dangles on
   * Chats you can no longer see (#163). A no-op for ids not currently selected.
   */
  deselect: (ids: Iterable<string>) => void;
  /**
   * Enter select-all-matching (#164): every Chat matching the current filter is
   * marked, expressed as "all minus `excludeIds`" rather than an id list the
   * client cannot enumerate (ADR-0021). A plain click, a range, `clear`, or a
   * filter/view change all leave the mode.
   */
  selectAllMatching: () => void;
  /** True while in select-all-matching mode. */
  allMatching: boolean;
  /**
   * The rows the user unchecked after selecting all (`Cmd/Ctrl+click`), the
   * "all matching except these" set. Empty and inert outside select-all-matching.
   */
  excludeIds: ReadonlySet<string>;
  /**
   * The effective number of marked Chats: the plain Selection size normally, or
   * the filtered total minus exclusions under select-all-matching.
   */
  selectedCount: number;
  /**
   * Whether a row renders as selected — membership in the Selection normally, or
   * "not excluded" under select-all-matching. The one predicate the list rows
   * read so they don't branch on the mode themselves.
   */
  isSelected: (id: string) => boolean;
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
  filteredTotal = 0,
}: UseSelectionParams): Selection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() =>
    primaryId ? new Set([primaryId]) : new Set()
  );
  // Select-all-matching (#164): the mode flag plus its "all minus these"
  // exclusion set. Both are inert until `selectAllMatching` turns the mode on.
  const [allMatching, setAllMatching] = useState(false);
  const [excludeIds, setExcludeIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  // Collapse to the primary on filter/view change without an effect: adjusting
  // state during render on a changed prop is the sanctioned React pattern. Sort
  // and refresh never change resetKey, so the Selection survives them. A filter/
  // view change also leaves select-all-matching — the matched set is no longer
  // the one the user selected over.
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setSelectedIds(primaryId ? new Set([primaryId]) : new Set());
    setAllMatching(false);
    setExcludeIds(new Set());
  }

  // Leave select-all-matching and reset its exclusions. Called by every gesture
  // that re-establishes an explicit Selection (plain click, range, clear).
  const exitAllMatching = useCallback(() => {
    setAllMatching(false);
    setExcludeIds(new Set());
  }, []);

  const selectOnly = useCallback(
    (id: string) => {
      exitAllMatching();
      setSelectedIds(new Set([id]));
    },
    [exitAllMatching]
  );

  const toggle = useCallback(
    (id: string) => {
      // Under select-all-matching a toggle records an exclusion (the
      // deselect-one gesture over "all matching"); otherwise it flips plain
      // membership. Read `allMatching` as a dependency rather than through a
      // setter: an updater that writes other state runs twice under
      // StrictMode, which flips the id and flips it straight back.
      const flip = (prev: ReadonlySet<string>) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      };
      if (allMatching) setExcludeIds(flip);
      else setSelectedIds(flip);
    },
    [allMatching]
  );

  const selectRange = useCallback(
    (anchorId: string | null, targetId: string, additive: boolean) => {
      exitAllMatching();
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
    [orderedIds, exitAllMatching]
  );

  const clear = useCallback(() => {
    exitAllMatching();
    setSelectedIds(new Set());
  }, [exitAllMatching]);

  const deselect = useCallback((ids: Iterable<string>) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const selectAllMatching = useCallback(() => {
    setAllMatching(true);
    setExcludeIds(new Set());
  }, []);

  const selectedCount = allMatching
    ? Math.max(0, filteredTotal - excludeIds.size)
    : selectedIds.size;

  const isSelected = useCallback(
    (id: string) => (allMatching ? !excludeIds.has(id) : selectedIds.has(id)),
    [allMatching, excludeIds, selectedIds]
  );

  return {
    selectedIds,
    selectOnly,
    toggle,
    selectRange,
    clear,
    deselect,
    selectAllMatching,
    allMatching,
    excludeIds,
    selectedCount,
    isSelected,
  };
}
