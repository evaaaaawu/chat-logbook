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

export const CHAT_SORT_CONFIG: SortConfig<SortField> = {
  storageKey: "chatlogbook.sort.chats",
  defaultField: "updatedAt",
  typeDefaults: { title: "asc", createdAt: "desc", updatedAt: "desc" },
};

export const CHAT_SORT_AXES: SortAxis<SortField>[] = [
  { field: "title", label: "Title" },
  { field: "createdAt", label: "Created time" },
  { field: "updatedAt", label: "Updated time" },
];

export const CHAT_DIRECTION_LABELS: DirectionLabels<SortField> = {
  title: { asc: "A-Z", desc: "Z-A" },
  createdAt: { asc: "Oldest first", desc: "Newest first" },
  updatedAt: { asc: "Oldest first", desc: "Newest first" },
};
