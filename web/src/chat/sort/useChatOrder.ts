import type { Chat } from "@/types";
import type { SortField } from "@/chat/sort/sortChats";
import type { SortControlProps } from "@/chat/sort/SortControl";
import {
  CHAT_DIRECTION_LABELS,
  CHAT_SORT_AXES,
  CHAT_SORT_CONFIG,
  TRASH_DIRECTION_LABELS,
  TRASH_SORT_AXES,
  TRASH_SORT_CONFIG,
} from "@/chat/sort/sortConfig";
import {
  useSortPreference,
  type UseSortPreferenceResult,
} from "@/chat/sort/useSortPreference";
import { useFrozenSort } from "@/chat/sort/useFrozenSort";

export type ChatView = "main" | "trash";

export interface ChatOrder {
  orderedChats: Chat[];
  sortControlProps: SortControlProps<SortField>;
}

// Per-view sort vocabulary: which config drives the preference, which axes and
// direction labels the SortControl shows, which test id the popover carries,
// and which chats the view contains. This mapping — "which view uses which
// config + filter" — is the knowledge that had no home when it lived inline in
// App.tsx; useChatOrder owns it.
const VIEWS = {
  main: {
    config: CHAT_SORT_CONFIG,
    axes: CHAT_SORT_AXES,
    directionLabels: CHAT_DIRECTION_LABELS,
    testId: "chat-sort-popover",
    includes: (c: Chat) => !c.isDeleted,
  },
  trash: {
    config: TRASH_SORT_CONFIG,
    axes: TRASH_SORT_AXES,
    directionLabels: TRASH_DIRECTION_LABELS,
    testId: "trash-sort-popover",
    includes: (c: Chat) => Boolean(c.isDeleted),
  },
} as const;

// Owns Chat-list ordering for one view: it composes the sort preference, the
// frozen-order anchor, and the flush signal behind a thin interface. App calls
// it once per view (main, trash). `flushSignal` is passed in — the hook is a
// pure function of (view, chats, flushSignal) and does not know the signal is
// itself composed of a data-action epoch and a view-switch generation.
//
// `externalPref` lets the caller own the preference instead of the hook. App
// uses this for the main view so it can read the same field/direction the
// SortControl drives and decide whether the data path paginates — the two must
// agree on a single preference instance, not two copies of the same storage.
export function useChatOrder(
  view: ChatView,
  chats: Chat[],
  flushSignal: string,
  externalPref?: UseSortPreferenceResult<SortField>
): ChatOrder {
  const { config, axes, directionLabels, testId, includes } = VIEWS[view];
  // Hooks must run unconditionally; when the caller supplies a preference the
  // internal one is left idle (its setters are never wired up).
  const ownPref = useSortPreference(config);
  const pref = externalPref ?? ownPref;
  const orderedChats = useFrozenSort(
    chats.filter(includes),
    pref.field,
    pref.direction,
    flushSignal
  );

  return {
    orderedChats,
    sortControlProps: {
      testId,
      axes,
      field: pref.field,
      direction: pref.direction,
      isDefault: pref.isDefault,
      directionLabels,
      onSelectField: pref.selectField,
      onToggleDirection: pref.toggleDirection,
    },
  };
}
