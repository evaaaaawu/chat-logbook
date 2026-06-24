import os from "node:os";
import { spawn } from "node:child_process";
import { resolveDevDataDir } from "../src/config/dev-data-dir.js";

// Manual dev launcher. Defaults CHAT_LOGBOOK_DATA_DIR to an isolated
// ~/.chat-logbook-dev so `pnpm dev` never mutates the real ~/.chat-logbook.
// To run against the real archive, clear the variable: `CHAT_LOGBOOK_DATA_DIR= pnpm dev`.
const dataDir = resolveDevDataDir(process.env, os.homedir());

// Pass the whole command as one shell string (not an args array) so Windows
// resolves `tsx.cmd` and Node does not warn about unescaped args (DEP0190).
// The resolved data dir travels via `env`, never interpolated into the string.
const child = spawn("tsx watch src/index.ts", {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    CHAT_LOGBOOK_DATA_DIR: dataDir,
    PORT: "3101",
    CHAT_LOGBOOK_NO_OPEN: "1",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
