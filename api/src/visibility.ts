import type { MetadataRepository } from "./metadata/repository.js";

// Visibility is enforced at the read API, not at storage — see
// chat-logbook/CLAUDE.md and docs/ARCHITECTURE.md. Archive rows are
// never deleted in response to a soft-delete; this helper is the single
// place that translates `data.sessions_meta.is_deleted` (and future
// flags like `is_archived`) into a yes/no answer for read paths.

export interface VisibilityOptions {
  includeTrashed?: boolean;
}

export interface SessionVisibility {
  isTrashed(internalId: string): boolean;
  isVisible(internalId: string): boolean;
}

export function loadSessionVisibility(
  metadata: MetadataRepository,
  opts: VisibilityOptions
): SessionVisibility {
  const trashed = new Set(metadata.listDeletedIds());
  const showTrashed = opts.includeTrashed === true;
  return {
    isTrashed: (internalId) => trashed.has(internalId),
    isVisible: (internalId) => showTrashed || !trashed.has(internalId),
  };
}
