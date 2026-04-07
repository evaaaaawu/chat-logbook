import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { listSessions, findSessionFile, getSessionMessages } from "./parser.js";

interface AppOptions {
  claudeDir: string;
  webDistDir?: string;
}

export function createApp({ claudeDir, webDistDir }: AppOptions) {
  const app = new Hono();

  app.get("/api/sessions", (c) => {
    const sessions = listSessions(claudeDir).filter(
      (session) => findSessionFile(claudeDir, session.id) !== null
    );
    return c.json({ sessions });
  });

  app.get("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const sessionPath = findSessionFile(claudeDir, sessionId);

    if (!sessionPath) {
      return c.json({ error: "Session not found" }, 404);
    }

    const messages = getSessionMessages(sessionPath);
    return c.json({ messages });
  });

  if (webDistDir) {
    app.use("*", serveStatic({ root: webDistDir }));
    app.use("*", serveStatic({ root: webDistDir, path: "index.html" }));
  }

  return app;
}
