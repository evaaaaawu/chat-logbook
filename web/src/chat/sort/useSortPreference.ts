import { useCallback, useMemo, useState } from "react";
import type { SortDirection } from "@/chat/sort/sortChats";
import {
  isDefaultSort,
  loadSortPreference,
  saveSortPreference,
  selectField,
  toggleDirection,
  type SortConfig,
  type SortPreference,
} from "@/chat/sort/sortPreference";

export interface UseSortPreferenceResult<F extends string> {
  field: F;
  direction: SortDirection;
  isDefault: boolean;
  selectField: (field: F) => void;
  toggleDirection: () => void;
}

export function useSortPreference<F extends string>(
  config: SortConfig<F>
): UseSortPreferenceResult<F> {
  const [pref, setPref] = useState<SortPreference<F>>(() =>
    loadSortPreference(config)
  );

  const update = useCallback(
    (next: SortPreference<F>) => {
      saveSortPreference(config, next);
      setPref(next);
    },
    [config]
  );

  const select = useCallback(
    (field: F) => update(selectField(pref, field)),
    [pref, update]
  );
  const toggle = useCallback(
    () => update(toggleDirection(pref)),
    [pref, update]
  );

  return useMemo(
    () => ({
      field: pref.field,
      direction: pref.directions[pref.field],
      isDefault: isDefaultSort(pref, config),
      selectField: select,
      toggleDirection: toggle,
    }),
    [pref, config, select, toggle]
  );
}
