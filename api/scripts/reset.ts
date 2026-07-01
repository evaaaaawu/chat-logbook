import os from "node:os";
import { resolveDataDir } from "../src/config/data-dir.js";
import { assertSeedDataDirSafe } from "../src/seed/guard.js";
import { resetDataDir } from "../src/seed/reset.js";

// Developer-only reset. Wipes every store file in the directory resolved from
// CHAT_LOGBOOK_DATA_DIR so a seeded dataset can be thrown away and rebuilt from
// scratch. The same guard the seed script uses refuses to touch the real,
// backup-worthy ~/.chat-logbook.
//
//   CHAT_LOGBOOK_DATA_DIR=~/.chat-logbook-seed pnpm --filter @chat-logbook/api reset

const dataDir = resolveDataDir(process.env, os.homedir());
assertSeedDataDirSafe(dataDir, os.homedir());

const { removed } = resetDataDir(dataDir);
if (removed.length === 0) {
  console.log(`Nothing to reset in ${dataDir} (no store files found).`);
} else {
  console.log(`Reset ${dataDir}: removed ${removed.join(", ")}.`);
}
