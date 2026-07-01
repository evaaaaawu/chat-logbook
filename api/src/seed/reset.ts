import fs from "node:fs";
import path from "node:path";

/**
 * Every chat-logbook store file that lives under a data directory. `index.db` is
 * planned (see ARCHITECTURE.md); `data.db` is the pre-v0.8 metadata filename.
 * Listing them explicitly — rather than globbing `*.db` — keeps the wipe
 * intentional and self-documenting, and leaves any unrelated file untouched.
 */
const STORE_FILES = [
  "archive.db",
  "metadata.db",
  "checkpoint.db",
  "index.db",
  "data.db",
] as const;

// SQLite can leave these sidecars next to a db (WAL mode); remove them too so a
// reset never leaves a half-deleted store behind.
const SIDECAR_SUFFIXES = ["", "-wal", "-shm"] as const;

export interface ResetSummary {
  /** Basenames of the files actually removed (existing ones only). */
  removed: string[];
}

/**
 * Deletes every chat-logbook store file under `dataDir`, returning the ones that
 * existed. Callers MUST guard the directory (see {@link ./guard.js}) first so
 * this can never wipe the real, backup-worthy archive. Non-store files are left
 * untouched, so pointing it at a shared directory only clears the stores.
 */
export function resetDataDir(dataDir: string): ResetSummary {
  const removed: string[] = [];
  for (const store of STORE_FILES) {
    for (const suffix of SIDECAR_SUFFIXES) {
      const name = `${store}${suffix}`;
      const target = path.join(dataDir, name);
      if (fs.existsSync(target)) {
        fs.rmSync(target);
        removed.push(name);
      }
    }
  }
  return { removed };
}
