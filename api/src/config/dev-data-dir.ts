import path from "node:path";
import { resolveDataDir } from "./data-dir.js";

/**
 * Resolves the data directory for a manual dev run (`pnpm dev`). When
 * `CHAT_LOGBOOK_DATA_DIR` is absent, it defaults to an isolated
 * `<homeDir>/.chat-logbook-dev` so day-to-day branch work never mutates the
 * developer's real `~/.chat-logbook` archive. When the developer sets the
 * variable (e.g. to a seeded dataset), that choice is respected — dev defers to
 * the same single-knob resolution as production.
 */
export function resolveDevDataDir(
  env: { CHAT_LOGBOOK_DATA_DIR?: string },
  homeDir: string
): string {
  if ("CHAT_LOGBOOK_DATA_DIR" in env) {
    return resolveDataDir(env, homeDir);
  }
  return path.join(homeDir, ".chat-logbook-dev");
}
