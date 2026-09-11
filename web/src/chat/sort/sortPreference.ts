import { isRecord } from "@/shared/isRecord";
import type { SortDirection } from "./sortChats";

export interface SortConfig<F extends string> {
  storageKey: string;
  defaultField: F;
  typeDefaults: Record<F, SortDirection>;
}

export interface SortPreference<F extends string> {
  field: F;
  directions: Record<F, SortDirection>;
}

export function defaultPreference<F extends string>(
  config: SortConfig<F>
): SortPreference<F> {
  return {
    field: config.defaultField,
    directions: { ...config.typeDefaults },
  };
}

export function selectField<F extends string>(
  pref: SortPreference<F>,
  field: F
): SortPreference<F> {
  return { field, directions: { ...pref.directions } };
}

export function toggleDirection<F extends string>(
  pref: SortPreference<F>
): SortPreference<F> {
  const next = pref.directions[pref.field] === "asc" ? "desc" : "asc";
  return {
    field: pref.field,
    directions: { ...pref.directions, [pref.field]: next },
  };
}

export function isDefaultSort<F extends string>(
  pref: SortPreference<F>,
  config: SortConfig<F>
): boolean {
  return (
    pref.field === config.defaultField &&
    pref.directions[pref.field] === config.typeDefaults[config.defaultField]
  );
}

const STORAGE_VERSION = 1;

export function saveSortPreference<F extends string>(
  config: SortConfig<F>,
  pref: SortPreference<F>
): void {
  const payload = {
    version: STORAGE_VERSION,
    field: pref.field,
    directions: pref.directions,
  };
  localStorage.setItem(config.storageKey, JSON.stringify(payload));
}

export function loadSortPreference<F extends string>(
  config: SortConfig<F>
): SortPreference<F> {
  const fallback = defaultPreference(config);
  const raw = localStorage.getItem(config.storageKey);
  if (raw == null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return fallback;

  const isField = (value: unknown): value is F =>
    typeof value === "string" && Object.hasOwn(config.typeDefaults, value);
  const field = isField(parsed.field) ? parsed.field : config.defaultField;

  // Start from type defaults, then overlay any valid stored per-field memory.
  const directions = { ...config.typeDefaults };
  const stored = parsed.directions;
  if (isRecord(stored)) {
    for (const key of Object.keys(config.typeDefaults).filter(isField)) {
      const value = stored[key];
      if (value === "asc" || value === "desc") directions[key] = value;
    }
  }

  return { field, directions };
}
