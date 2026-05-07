import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createMetadataRepository } from "./metadata/repository.js";
import { listSessions, findSessionFile, getSessionMessages } from "./parser.js";

interface AppOptions {
  claudeDir: string;
  dataDir: string;
  webDistDir?: string;
}

export function createApp({ claudeDir, dataDir, webDistDir }: AppOptions) {
  const app = new Hono();
  const metadata = createMetadataRepository({ dataDir });

  app.get("/api/sessions", (c) => {
    const includeDeleted = c.req.query("includeDeleted") === "true";
    const deleted = new Set(metadata.listDeletedIds());
    const sessions = listSessions(claudeDir)
      .filter((session) => findSessionFile(claudeDir, session.id) !== null)
      .filter((session) => includeDeleted || !deleted.has(session.id))
      .map((session) =>
        deleted.has(session.id) ? { ...session, isDeleted: true } : session
      );
    return c.json({ sessions });
  });

  app.delete("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    if (findSessionFile(claudeDir, sessionId) === null) {
      return c.json({ error: "Session not found" }, 404);
    }
    metadata.softDelete(sessionId);
    return c.body(null, 204);
  });

  app.post("/api/sessions/:id/restore", (c) => {
    const sessionId = c.req.param("id");
    if (findSessionFile(claudeDir, sessionId) === null) {
      return c.json({ error: "Session not found" }, 404);
    }
    metadata.restore(sessionId);
    return c.body(null, 204);
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
