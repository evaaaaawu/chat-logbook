import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const claudeDir = path.join(os.homedir(), ".claude");
const webDistDir = path.join(__dirname, "../../web/dist");
const app = createApp({ claudeDir, webDistDir });
const port = Number(process.env.PORT) || 3100;

const server = serve({ fetch: app.fetch, port }, (info: { port: number }) => {
  console.log(`chat-logbook listening on http://localhost:${info.port}`);
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
