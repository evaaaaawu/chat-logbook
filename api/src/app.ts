import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ArchiveRepository } from "./archive/repository.js";
import type { MetadataRepository } from "./metadata/repository.js";
import type { TagRepository } from "./metadata/tags.js";
import { isColorToken } from "./metadata/tag-colors.js";
import { createChatReader } from "./chat-reader.js";

interface AppOptions {
  archive: ArchiveRepository;
  metadata: MetadataRepository;
  tags: TagRepository;
  webDistDir?: string;
}

export function createApp({ archive, metadata, tags, webDistDir }: AppOptions) {
  const app = new Hono();
  const reader = createChatReader({ archive, metadata, tags });

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

  app.get("/api/tags", (c) => {
    return c.json({ tags: tags.listTags() });
  });

  app.post("/api/tags", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const name =
      body && typeof body === "object"
        ? (body as { name?: unknown }).name
        : undefined;
    const color =
      body && typeof body === "object"
        ? (body as { color?: unknown }).color
        : undefined;
    if (typeof name !== "string" || name.trim().length === 0) {
      return c.json({ error: "Invalid name" }, 400);
    }
    if (!isColorToken(color)) {
      return c.json({ error: "Invalid color" }, 400);
    }
    const tag = tags.createTag(name.trim(), color);
    return c.json({ tag }, 201);
  });

  app.patch("/api/tags/:id", async (c) => {
    const id = c.req.param("id");
    if (!tags.getTag(id)) {
      return c.json({ error: "Tag not found" }, 404);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const name =
      body && typeof body === "object"
        ? (body as { name?: unknown }).name
        : undefined;
    const color =
      body && typeof body === "object"
        ? (body as { color?: unknown }).color
        : undefined;
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return c.json({ error: "Invalid name" }, 400);
      }
    }
    if (color !== undefined && !isColorToken(color)) {
      return c.json({ error: "Invalid color" }, 400);
    }
    if (typeof name === "string") tags.renameTag(id, name.trim());
    if (isColorToken(color)) tags.recolorTag(id, color);
    return c.body(null, 204);
  });

  app.delete("/api/tags/:id", (c) => {
    if (!tags.getTag(c.req.param("id"))) {
      return c.json({ error: "Tag not found" }, 404);
    }
    const result = tags.deleteTag(c.req.param("id"));
    return c.json(result);
  });

  app.post("/api/chats/:id/tags", async (c) => {
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
    const tagId =
      body && typeof body === "object"
        ? (body as { tagId?: unknown }).tagId
        : undefined;
    if (typeof tagId !== "string" || !tags.getTag(tagId)) {
      return c.json({ error: "Tag not found" }, 404);
    }
    tags.assignTag(row.id, tagId);
    return c.body(null, 204);
  });

  app.delete("/api/chats/:id/tags/:tagId", (c) => {
    const row = reader.findChat(c.req.param("id"));
    if (!row) {
      return c.json({ error: "Chat not found" }, 404);
    }
    tags.removeTag(row.id, c.req.param("tagId"));
    return c.body(null, 204);
  });

  if (webDistDir) {
    app.use("*", serveStatic({ root: webDistDir }));
    app.use("*", serveStatic({ root: webDistDir, path: "index.html" }));
  }

  return app;
}
