/**
 * Per-view persistence for the Tag filter's Match mode (ADR-0016 update). `all`
 * (default) ANDs the selected Tags; `any` ORs them and lets `Untagged` join the
 * union. Persisted per view — keyed like the sort preference — so a chosen `any`
 * survives reloads. Mirrors the versioned localStorage shape of the sort
 * preference so a future format change can be detected and ignored.
 */
import { isRecord } from "@/shared/isRecord";

export type TagMode = "all" | "any";

const STORAGE_VERSION = 1;

export function saveTagMode(storageKey: string, mode: TagMode): void {
  const payload = { version: STORAGE_VERSION, mode };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function loadTagMode(storageKey: string): TagMode {
  const raw = localStorage.getItem(storageKey);
  if (raw == null) return "all";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "all";
  }

  if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return "all";
  return parsed.mode === "any" ? "any" : "all";
}
