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

  if (typeof parsed !== "object" || parsed === null) return fallback;
  const record = parsed as Record<string, unknown>;
  if (record.version !== STORAGE_VERSION) return fallback;

  const fields = Object.keys(config.typeDefaults) as F[];
  const field =
    typeof record.field === "string" && fields.includes(record.field as F)
      ? (record.field as F)
      : config.defaultField;

  // Start from type defaults, then overlay any valid stored per-field memory.
  const directions = { ...config.typeDefaults };
  const stored = record.directions;
  if (typeof stored === "object" && stored !== null) {
    for (const key of fields) {
      const value = (stored as Record<string, unknown>)[key];
      if (value === "asc" || value === "desc") directions[key] = value;
    }
  }

  return { field, directions };
}
