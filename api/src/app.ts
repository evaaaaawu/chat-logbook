import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ArchiveRepository } from "./archive/repository.js";
import type { MetadataRepository } from "./metadata/repository.js";
import type { Tag, TagRepository } from "./metadata/tags.js";
import { isColorToken } from "./metadata/tag-colors.js";
import { createChatReader } from "./chat-reader.js";
import type { ChatPageQuery } from "./list-pagination.js";
import type { ChatCountsQuery } from "./list-counts.js";
import type { ListEventHub } from "./list-events.js";
import { MAX_PAGE_LIMIT } from "./list-contract.js";
import { plugins } from "./plugins/registry.js";

// Heartbeat cadence for the live-update SSE stream. A periodic comment keeps the
// connection from idling out behind proxies and surfaces a dropped socket so the
// client can reconnect (issue #132).
const STREAM_HEARTBEAT_MS = 25_000;

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
  /**
   * The live-update event hub (issue #132). When present, `GET
   * /api/chats/stream` serves a Server-Sent Events channel that pushes a
   * `changed` event after each ingest pass, so the loaded list window can
   * reconcile without a periodic full refetch. Without it that route reports
   * 501.
   */
  listEvents?: ListEventHub;
  webDistDir?: string;
}

export function createApp({
  archive,
  metadata,
  tags,
  pageQuery,
  countsQuery,
  listEvents,
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

    // The List reads one server-sorted keyset page per request (ADR-0017): the
    // sort + window run inside the cross-store SQL pass, so `?limit=` is
    // required and the endpoint never loads the full list.
    const limitParam = c.req.query("limit");
    if (limitParam === undefined) {
      return c.json({ error: "Missing limit" }, 400);
    }
    if (!pageQuery) {
      return c.json({ error: "Pagination is not available" }, 501);
    }
    const limit = Number.parseInt(limitParam, 10);
    if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_PAGE_LIMIT) {
      return c.json({ error: "Invalid limit" }, 400);
    }
    const sort = c.req.query("sort") ?? "updatedAt";
    // `deletedAt` is the Trash view's deleted-time axis (#145); it sorts
    // through the ATTACHed Metadata store and is trash-only by nature.
    // `title` sorts through the ATTACHed `chat_sort_keys` collation index
    // (#146 / ADR-0019), in both the main view and Trash.
    if (
      sort !== "createdAt" &&
      sort !== "updatedAt" &&
      sort !== "deletedAt" &&
      sort !== "title"
    ) {
      return c.json({ error: "Invalid sort" }, 400);
    }
    // Direction defaults to "desc" (newest-first) so existing callers that
    // omit it are unchanged; the covering index scans either way (#143).
    const direction = c.req.query("direction") ?? "desc";
    if (direction !== "asc" && direction !== "desc") {
      return c.json({ error: "Invalid direction" }, 400);
    }
    // The Trash view scopes the page to soft-deleted chats only (#145),
    // distinct from `includeTrashed` (active + trashed). The frontend sends it
    // for every Trash page; the `deletedAt` axis is trash-only regardless.
    const trashedOnly = c.req.query("trashedOnly") === "true";
    // The active filter pages server-side alongside the keyset window (#130):
    // repeated `?project=` unions (OR), a single comma-separated `?tags=` ANDs.
    // An empty value selects the `(No project)` / `Untagged` group; an absent
    // param is undefined => unfiltered.
    const projects = c.req.queries("project");
    const tagsParam = c.req.query("tags");
    const tagSelection =
      tagsParam === undefined ? undefined : tagsParam.split(",");
    // `tagMode` chooses how the selected real Tags combine: `all` (default, AND)
    // or `any` (OR, with `Untagged` joining the union) — ADR-0016 update.
    // Validated to the fixed pair like `direction`, so an unknown value is a 400
    // rather than a silent fallback.
    const tagMode = c.req.query("tagMode") ?? "all";
    if (tagMode !== "all" && tagMode !== "any") {
      return c.json({ error: "Invalid tagMode" }, 400);
    }
    const { chats, nextCursor } = reader.listChatsPage({
      sort,
      direction,
      limit,
      cursor: c.req.query("cursor"),
      includeTrashed,
      trashedOnly,
      projects,
      tags: tagSelection,
      tagMode,
    });
    return c.json({ chats, nextCursor });
  });

  // The live-update channel (issue #132): a Server-Sent Events stream that
  // pushes a `changed` event after each ingest pass, driven by the watcher
  // through the in-process event hub. The client reconciles its loaded window
  // head through the keyset query on each event — the event is the signal, the
  // sort/filter stay server-side. Registered before `/api/chats/:id` so the
  // literal `stream` segment is not captured as an id.
  app.get("/api/chats/stream", (c) => {
    if (!listEvents) {
      return c.json({ error: "Live updates are not available" }, 501);
    }
    const hub = listEvents;
    return streamSSE(c, async (stream) => {
      const unsubscribe = hub.subscribe((event) => {
        // The data frame carries the changed chat ids so a client showing one
        // conversation re-reads only when its chat is named (issue #189). The
        // list consumer ignores the payload and reconciles on every event.
        void stream.writeSSE({
          event: event.type,
          data: JSON.stringify({ chatIds: event.chatIds ?? [] }),
        });
      });
      // Hold the connection open with periodic heartbeats until the client
      // disconnects; `onAbort` clears the timer and resolves so the callback
      // returns and the stream closes cleanly (no dangling timer).
      await new Promise<void>((resolve) => {
        const heartbeat = setInterval(() => {
          void stream.writeSSE({ event: "ping", data: "" });
        }, STREAM_HEARTBEAT_MS);
        stream.onAbort(() => {
          clearInterval(heartbeat);
          unsubscribe();
          resolve();
        });
      });
    });
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
    // `tagMode` chooses how the selected real Tags combine (ADR-0016 update);
    // validated to the fixed pair like the paginated list route.
    const tagMode = c.req.query("tagMode") ?? "all";
    if (tagMode !== "all" && tagMode !== "any") {
      return c.json({ error: "Invalid tagMode" }, 400);
    }
    const total = reader.listFilteredTotal({
      includeTrashed,
      projects,
      tags,
      tagMode,
    });
    return c.json({ total });
  });

  // Per-Tag counts scoped to the active filter (#164), so the batch dialog's
  // tri-state under select-all-matching is accurate even when a Project/Tag
  // filter narrows the set. Same query parsing as `/list-total`; the client
  // subtracts the excluded Chats' own Tags locally (ADR-0021). Registered before
  // `/api/chats/:id` so the literal segment is not captured as an id.
  app.get("/api/chats/filtered-tag-counts", (c) => {
    if (!countsQuery) {
      return c.json({ error: "Counts are not available" }, 501);
    }
    const includeTrashed = c.req.query("includeTrashed") === "true";
    const projects = c.req.queries("project");
    const tagsParam = c.req.query("tags");
    const tags = tagsParam === undefined ? undefined : tagsParam.split(",");
    const tagMode = c.req.query("tagMode") ?? "all";
    if (tagMode !== "all" && tagMode !== "any") {
      return c.json({ error: "Invalid tagMode" }, 400);
    }
    return c.json({
      tags: countsQuery.queryFilteredTagCounts({
        includeTrashed,
        projects,
        tags,
        tagMode,
      }),
    });
  });

  // Map a list of wire ids to the internal ids the metadata write flips,
  // dropping any that no longer resolve (e.g. purged from the Archive) so one
  // stale id can't 500 the whole batch.
  function toInternalIds(wireIds: unknown): string[] {
    if (!Array.isArray(wireIds)) return [];
    const internalIds: string[] = [];
    for (const wireId of wireIds) {
      if (typeof wireId !== "string") continue;
      const row = reader.findChat(wireId);
      if (row) internalIds.push(row.id);
    }
    return internalIds;
  }

  function toStringArray(v: unknown): string[] | undefined {
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : undefined;
  }

  // Resolve a batch request body to the internal ids the metadata write flips
  // (ADR-0021). The body is one of two branches: `{ chatIds: [...] }` — the
  // explicit set the user checked (#161) — or `{ filter, excludeIds }` —
  // select-all-matching, every Chat matching the active filter minus a small
  // exclusion set, resolved server-side through the same `buildFilterClauses`
  // predicate the list uses so no id list is shipped over the wire (#164).
  // Returns null when the body is neither branch.
  async function resolveBatchIds(c: {
    req: { json: () => Promise<unknown> };
  }): Promise<string[] | null> {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return null;
    }
    const chatIds = (body as { chatIds?: unknown })?.chatIds;
    if (Array.isArray(chatIds)) return toInternalIds(chatIds);

    const filter = (body as { filter?: unknown })?.filter;
    if (filter && typeof filter === "object" && countsQuery) {
      const f = filter as {
        projects?: unknown;
        tags?: unknown;
        tagMode?: unknown;
        includeTrashed?: unknown;
      };
      return countsQuery.queryFilteredIds({
        projects: toStringArray(f.projects),
        tags: toStringArray(f.tags),
        tagMode: f.tagMode === "any" ? "any" : "all",
        includeTrashed: f.includeTrashed === true,
        excludeIds: toInternalIds(
          (body as { excludeIds?: unknown })?.excludeIds
        ),
      });
    }
    return null;
  }

  // Registered before `/api/chats/:id/restore` so the literal `batch` segment is
  // not captured as an id.
  app.post("/api/chats/batch/trash", async (c) => {
    const internalIds = await resolveBatchIds(c);
    if (internalIds === null) {
      return c.json({ error: "Invalid chatIds" }, 400);
    }
    metadata.softDeleteBatch(internalIds);
    return c.json({ count: internalIds.length });
  });

  app.post("/api/chats/batch/restore", async (c) => {
    const internalIds = await resolveBatchIds(c);
    if (internalIds === null) {
      return c.json({ error: "Invalid chatIds" }, 400);
    }
    metadata.restoreBatch(internalIds);
    return c.json({ count: internalIds.length });
  });

  // Apply a staged Tag add/remove diff across the Selection in one transaction
  // (#163, ADR-0021 explicit-ids branch). The body carries the same `chatIds`
  // set as the Trash/Restore batch plus `add`/`remove` tag-id lists; unknown
  // ids in either dimension are dropped rather than failing the batch.
  app.post("/api/chats/batch/tags", async (c) => {
    const internalIds = await resolveBatchIds(c);
    if (internalIds === null) {
      return c.json({ error: "Invalid chatIds" }, 400);
    }
    const body = (await c.req.json()) as { add?: unknown; remove?: unknown };
    const toIds = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [];
    tags.assignTagsBatch(internalIds, {
      add: toIds(body.add),
      remove: toIds(body.remove),
    });
    return c.json({ count: internalIds.length });
  });

  // Tags grouped across the Selection in one query (#163), so the batch
  // TagPickerDialog can derive each row's tri-state (all/some/none) without a
  // per-Chat round-trip (ADR-0016). Keyed by the wire id the client sent so it
  // maps straight back onto the Selection.
  app.post("/api/chats/batch/tags-by-chat", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid chatIds" }, 400);
    }
    const chatIds = (body as { chatIds?: unknown })?.chatIds;
    if (!Array.isArray(chatIds)) {
      return c.json({ error: "Invalid chatIds" }, 400);
    }
    const pairs: Array<[string, string]> = [];
    for (const wireId of chatIds) {
      if (typeof wireId !== "string") continue;
      const row = reader.findChat(wireId);
      if (row) pairs.push([wireId, row.id]);
    }
    const grouped = tags.listTagsByChat(pairs.map(([, internal]) => internal));
    const byChat: Record<string, Tag[]> = {};
    for (const [wireId, internalId] of pairs) {
      byChat[wireId] = grouped.get(internalId) ?? [];
    }
    return c.json({ byChat });
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

  // Inline image bytes, extracted from the Raw payload at request time so the
  // messages payload stays free of base64 and the archive stores each image once
  // (ADR-0023). Nothing here reads the Source file, so an image outlives the
  // screenshot being deleted from disk.
  app.get("/api/chats/:id/images/:ref", (c) => {
    const row = reader.findChat(c.req.param("id"));
    if (!row) return c.json({ error: "Chat not found" }, 404);

    const plugin = plugins.find((p) => p.id === row.agent);
    if (!plugin?.resolveImage) {
      return c.json({ error: "Image not found" }, 404);
    }

    const image = plugin.resolveImage(c.req.param("ref"), (messageId) => {
      const payload = archive.read.findRawPayloadForMessage(
        row.agent,
        row.sourceId,
        messageId
      );
      if (payload === null) return null;
      try {
        return JSON.parse(payload);
      } catch {
        return null;
      }
    });
    if (!image) return c.json({ error: "Image not found" }, 404);

    // Hono's body takes a plain Uint8Array; a Node Buffer's backing store is
    // typed loosely enough that it does not satisfy that signature.
    return c.body(new Uint8Array(image.bytes), 200, {
      "Content-Type": image.mediaType,
      // Archived bytes never change, so the browser can keep them forever.
      "Cache-Control": "public, max-age=31536000, immutable",
    });
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
