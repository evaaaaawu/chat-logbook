import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  noExternal: [/^(?!(update-notifier|better-sqlite3)).*/],
  async onSuccess() {
    const src = path.resolve("drizzle");
    const dest = path.resolve("dist/drizzle");
    fs.cpSync(src, dest, { recursive: true });
  },
});
