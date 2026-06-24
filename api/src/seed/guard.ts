import path from "node:path";

/**
 * Refuses to seed the real, backup-worthy archive. The synthetic dataset
 * generator only ever targets a throwaway dev directory; writing tens of
 * thousands of fake Chats into `~/.chat-logbook` would corrupt the developer's
 * real history. Compares resolved paths so a relative or `..`-laden override
 * can't sneak past the check.
 */
export function assertSeedDataDirSafe(dataDir: string, homeDir: string): void {
  const target = path.resolve(dataDir);
  const real = path.join(path.resolve(homeDir), ".chat-logbook");
  if (target === real) {
    throw new Error(
      `Refusing to seed the real archive at ${real}. Point ` +
        `CHAT_LOGBOOK_DATA_DIR at a throwaway directory (e.g. ~/.chat-logbook-dev).`
    );
  }
}
