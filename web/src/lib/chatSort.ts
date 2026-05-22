import type { SortDirection, SortField } from "./sortChats";
import type { SortConfig } from "./sortPreference";

export interface SortAxis<F extends string> {
  field: F;
  label: string;
}

export type DirectionLabels<F extends string> = Record<
  F,
  Record<SortDirection, string>
>;

const TIME_LABELS = { asc: "Oldest first", desc: "Newest first" } as const;

// The Chats list omits the deletedAt axis (only Trash sorts by it), but the
// shared SortField type still requires an entry in these per-field records.
export const CHAT_SORT_CONFIG: SortConfig<SortField> = {
  storageKey: "chatlogbook.sort.chats",
  defaultField: "updatedAt",
  typeDefaults: {
    title: "asc",
    createdAt: "desc",
    updatedAt: "desc",
    deletedAt: "desc",
  },
};

export const CHAT_SORT_AXES: SortAxis<SortField>[] = [
  { field: "title", label: "Title" },
  { field: "createdAt", label: "Created time" },
  { field: "updatedAt", label: "Updated time" },
];

export const CHAT_DIRECTION_LABELS: DirectionLabels<SortField> = {
  title: { asc: "A-Z", desc: "Z-A" },
  createdAt: { ...TIME_LABELS },
  updatedAt: { ...TIME_LABELS },
  deletedAt: { ...TIME_LABELS },
};

// Trash sorts independently of the Chats list, defaulting to most-recently
// deleted first. Deleted time is placed last in the axis menu.
export const TRASH_SORT_CONFIG: SortConfig<SortField> = {
  storageKey: "chatlogbook.sort.trash",
  defaultField: "deletedAt",
  typeDefaults: {
    title: "asc",
    createdAt: "desc",
    updatedAt: "desc",
    deletedAt: "desc",
  },
};

export const TRASH_SORT_AXES: SortAxis<SortField>[] = [
  { field: "title", label: "Title" },
  { field: "createdAt", label: "Created time" },
  { field: "updatedAt", label: "Updated time" },
  { field: "deletedAt", label: "Deleted time" },
];

export const TRASH_DIRECTION_LABELS: DirectionLabels<SortField> = {
  title: { asc: "A-Z", desc: "Z-A" },
  createdAt: { ...TIME_LABELS },
  updatedAt: { ...TIME_LABELS },
  deletedAt: { ...TIME_LABELS },
};
