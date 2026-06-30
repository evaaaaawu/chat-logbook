import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ArchiveRepository } from "./archive/repository.js";
import type { MetadataRepository } from "./metadata/repository.js";
import type { TagRepository } from "./metadata/tags.js";
import { isColorToken } from "./metadata/tag-colors.js";
import { createChatReader } from "./chat-reader.js";
import type { ChatPageQuery } from "./list-pagination.js";
import type { ChatCountsQuery } from "./list-counts.js";
import { MAX_PAGE_LIMIT } from "./list-contract.js";

interface AppOptions {
  archive: ArchiveRepository;
  metadata: MetadataRepository;
  tags: TagRepository;
  /**
   * The keyset page query (ADR-0017). When present, `GET /api/chats?limit=…`
   * serves one sorted, keyset-paginated page; without it (or without `limit`)
   * the endpoint keeps the legacy full-list behavior.
   */
  pageQuery?: ChatPageQuery;
  /**
   * The facet-count aggregation (issue #131 Phase A). When present,
   * `GET /api/chats/counts` serves the per-view facet + list counts; without it
   * that route reports 501.
   */
  countsQuery?: ChatCountsQuery;
  webDistDir?: string;
}

export function createApp({
  archive,
  metadata,
  tags,
  pageQuery,
  countsQuery,
  webDistDir,
}: AppOptions) {
  const app = new Hono();
  const reader = createChatReader({
    archive,
    metadata,
    tags,
    pageQuery,
    countsQuery,
  });

  app.get("/api/chats", (c) => {
    const includeTrashed = c.req.query("includeTrashed") === "true";

    // Paginated mode: `?limit=` opts into one server-sorted keyset page. The
    // legacy full-list path below stays for callers that omit `limit` (Trash and
    // the title sort, until they migrate).
    const limitParam = c.req.query("limit");
    if (limitParam !== undefined) {
      if (!pageQuery) {
        return c.json({ error: "Pagination is not available" }, 501);
      }
      const limit = Number.parseInt(limitParam, 10);
      if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_PAGE_LIMIT) {
        return c.json({ error: "Invalid limit" }, 400);
      }
      const sort = c.req.query("sort") ?? "updatedAt";
      if (sort !== "createdAt" && sort !== "updatedAt") {
        return c.json({ error: "Invalid sort" }, 400);
      }
      // Direction defaults to "desc" (newest-first) so existing callers that
      // omit it are unchanged; the covering index scans either way (#143).
      const direction = c.req.query("direction") ?? "desc";
      if (direction !== "asc" && direction !== "desc") {
        return c.json({ error: "Invalid direction" }, 400);
      }
      // The active filter pages server-side alongside the keyset window (#130),
      // parsed the same way as the legacy full-list branch: repeated `?project=`
      // unions (OR), a single comma-separated `?tags=` ANDs. An empty value
      // selects the `(No project)` / `Untagged` group; an absent param is
      // undefined => unfiltered.
      const projects = c.req.queries("project");
      const tagsParam = c.req.query("tags");
      const tagSelection =
        tagsParam === undefined ? undefined : tagsParam.split(",");
      const { chats, nextCursor } = reader.listChatsPage({
        sort,
        direction,
        limit,
        cursor: c.req.query("cursor"),
        includeTrashed,
        projects,
        tags: tagSelection,
      });
      return c.json({ chats, nextCursor });
    }

    // Repeated `?project=` params union (OR); an empty value selects the
    // `(No project)` group. Absent param => undefined => unfiltered.
    const projects = c.req.queries("project");
    // A single comma-separated `?tags=` param, AND within. `tags=` (empty)
    // splits to `[""]` — the `Untagged` group — mirroring `project=`'s empty
    // `(No project)` convention. Absent param => undefined => unfiltered.
    const tagsParam = c.req.query("tags");
    const tags = tagsParam === undefined ? undefined : tagsParam.split(",");
    const chats = reader.listChats({
      includeTrashed,
      projects,
      tags,
    });
    return c.json({ chats });
  });

  // The filter panel's static, per-view counts (issue #131 Phase A). Registered
  // before `/api/chats/:id` so the literal `counts` segment is not captured as
  // an id. `includeTrashed=true` scopes the counts to the Trash view.
  app.get("/api/chats/counts", (c) => {
    if (!countsQuery) {
      return c.json({ error: "Counts are not available" }, 501);
    }
    const includeTrashed = c.req.query("includeTrashed") === "true";
    return c.json(reader.listCounts({ includeTrashed }));
  });

  // The filtered List count ("Chats N" when a filter is active; issue #131
  // Phase B). Separate from the static facet counts so toggling a filter does
  // not refetch the per-view facets. The filter is parsed the same way as the
  // list routes: repeated `?project=` unions (OR), a single comma-separated
  // `?tags=` ANDs; an empty value selects the `(No project)` / `Untagged` group.
  // Registered before `/api/chats/:id` so the literal segment is not an id.
  app.get("/api/chats/list-total", (c) => {
    if (!countsQuery) {
      return c.json({ error: "Counts are not available" }, 501);
    }
    const includeTrashed = c.req.query("includeTrashed") === "true";
    const projects = c.req.queries("project");
    const tagsParam = c.req.query("tags");
    const tags = tagsParam === undefined ? undefined : tagsParam.split(",");
    const total = reader.listFilteredTotal({ includeTrashed, projects, tags });
    return c.json({ total });
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
