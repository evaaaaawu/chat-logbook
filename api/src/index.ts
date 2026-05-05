import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import updateNotifier from "update-notifier";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, "../../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
  name: string;
  version: string;
};

updateNotifier({ pkg }).notify();

const claudeDir = path.join(os.homedir(), ".claude");
const dataDir = path.join(os.homedir(), ".chat-logbook");
const webDistDir = path.join(__dirname, "../../web/dist");
const app = createApp({ claudeDir, dataDir, webDistDir });
const port = Number(process.env.PORT) || 3100;

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}

const server = serve({ fetch: app.fetch, port }, (info: { port: number }) => {
  const url = `http://localhost:${info.port}`;
  console.log(`chat-logbook is running at \x1b[36m${url}\x1b[0m`);
  openBrowser(url);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Try a different port:\n\n  PORT=8080 chat-log\n`
    );
    process.exit(1);
  }
  throw err;
});
