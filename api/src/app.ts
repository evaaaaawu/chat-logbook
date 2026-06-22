import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ArchiveRepository } from "./archive/repository.js";
import type { MetadataRepository } from "./metadata/repository.js";
import { createChatReader } from "./chat-reader.js";

interface AppOptions {
  archive: ArchiveRepository;
  metadata: MetadataRepository;
  webDistDir?: string;
}

export function createApp({ archive, metadata, webDistDir }: AppOptions) {
  const app = new Hono();
  const reader = createChatReader({ archive, metadata });

  app.get("/api/chats", (c) => {
    // Repeated `?project=` params union (OR); an empty value selects the
    // `(No project)` group. Absent param => undefined => unfiltered.
    const projects = c.req.queries("project");
    const chats = reader.listChats({
      includeTrashed: c.req.query("includeTrashed") === "true",
      projects,
    });
    return c.json({ chats });
  });

  app.delete("/api/chats/:id", (c) => {
    const row = reader.findChat(c.req.param("id"));
    if (!row) {
      return c.json({ error: "Chat not found" }, 404);
    }
    metadata.softDelete(row.id);
    return c.body(null, 204);
  });

  app.post("/api/chats/:id/restore", (c) => {
    const row = reader.findChat(c.req.param("id"));
    if (!row) {
      return c.json({ error: "Chat not found" }, 404);
    }
    metadata.restore(row.id);
    return c.body(null, 204);
  });

  app.patch("/api/chats/:id/title", async (c) => {
    const row = reader.findChat(c.req.param("id"));
    if (!row) {
      return c.json({ error: "Chat not found" }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      typeof (body as { title?: unknown }).title !== "string"
    ) {
      return c.json({ error: "Invalid title" }, 400);
    }
    const raw = (body as { title: string }).title;
    if (raw.length > 200) {
      return c.json({ error: "Title too long" }, 400);
    }
    const trimmed = raw.trim();
    metadata.setCustomTitle(row.id, trimmed.length > 0 ? trimmed : null);
    return c.body(null, 204);
  });

  app.get("/api/chats/:id", (c) => {
    const messages = reader.getMessages(c.req.param("id"), {
      includeTrashed: c.req.query("includeTrashed") === "true",
    });
    if (messages === null) {
      return c.json({ error: "Chat not found" }, 404);
    }
    return c.json({ messages });
  });

  if (webDistDir) {
    app.use("*", serveStatic({ root: webDistDir }));
    app.use("*", serveStatic({ root: webDistDir, path: "index.html" }));
  }

  return app;
}
