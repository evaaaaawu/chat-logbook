import path from "node:path";

/**
 * Resolves the data directory that holds every store (Archive, Metadata,
 * Checkpoint, Index). A single knob — `CHAT_LOGBOOK_DATA_DIR` — overrides the
 * location for all of them; when unset, the default `~/.chat-logbook` is used,
 * so existing installs are unaffected (Twelve-Factor Config).
 */
export function resolveDataDir(
  env: { CHAT_LOGBOOK_DATA_DIR?: string },
  homeDir: string
): string {
  const override = env.CHAT_LOGBOOK_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(homeDir, ".chat-logbook");
}
