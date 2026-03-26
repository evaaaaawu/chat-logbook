import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const claudeDir = path.join(os.homedir(), ".claude");
const app = createApp(claudeDir);
const port = 3000;

serve({ fetch: app.fetch, port }, (info: { port: number }) => {
  console.log(`chat-logbook listening on http://localhost:${info.port}`);
});
