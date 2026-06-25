import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createApp } from "./app.js";
import { createArchiveRepository } from "./archive/repository.js";
import { createMetadataRepository } from "./metadata/repository.js";
import { createTagRepository } from "./metadata/tags.js";
import type { Tag } from "./metadata/tags.js";
import { formatChatId } from "./archive/chat-id.js";
import { createChatPageQuery } from "./list-pagination.js";

interface ChatResponse {
  id: string;
  sourceId: string;
  agent: string;
  title: string;
  project: string;
  projectPath: string | null;
  sourceFilePath: string | null;
  createdAt: number;
  updatedAt: number;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

interface MessageResponse {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  timestamp: string;
}

const DEFAULT_AGENT = "claude-code";

function seedChat(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    sourceId: string;
    firstSeenAt: Date;
    project?: string | null;
  }
): string {
  return archive.ensureChat(
    DEFAULT_AGENT,
    opts.sourceId,
    opts.firstSeenAt,
    opts.project ?? undefined
  );
}

function seedMessage(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    sourceId: string;
    messageId: string;
    role: "user" | "assistant";
    ts: Date;
    text: string;
    blocks: unknown[];
  }
): void {
  archive.ensureChat(DEFAULT_AGENT, opts.sourceId, opts.ts);
  const raw = archive.insertRawMessage({
    agent: DEFAULT_AGENT,
    sourceId: opts.sourceId,
    sourcePath: "/dev/null",
    sourceLocator: `${opts.messageId}:0`,
    payload: { id: opts.messageId },
    ingestedAt: opts.ts,
  });
  archive.upsertNormalizedMessage({
    agent: DEFAULT_AGENT,
    sourceId: opts.sourceId,
    rawId: raw.id,
    message: {
      messageId: opts.messageId,
      role: opts.role,
      ts: opts.ts.toISOString(),
      text: opts.text,
      blocks: opts.blocks,
    },
  });
}

// The public route handle is the wire-form chat id. Tests seed by source id,
// so this renders the wire form to put in the URL.
function wireIdFor(
  archive: ReturnType<typeof createArchiveRepository>,
  sourceId: string
): string {
  const row = archive.read.findChatBySourceId(sourceId);
  if (!row) throw new Error(`no seeded chat for source id ${sourceId}`);
  return formatChatId(row.chatId);
}

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-app-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/chats — keyset pagination mode", () => {
  it("serves one sorted page and round-trips the cursor to the next", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    for (let i = 1; i <= 3; i++) {
      seedChat(archive, { sourceId: `c${i}`, firstSeenAt: new Date(i * 1000) });
    }

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
      pageQuery: createChatPageQuery({ dataDir }),
    });

    const first = await app.request("/api/chats?sort=createdAt&limit=2");
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      chats: ChatResponse[];
      nextCursor: string | null;
    };
    expect(firstBody.chats.map((c) => c.sourceId)).toEqual(["c3", "c2"]);
    expect(typeof firstBody.nextCursor).toBe("string");

    const next = await app.request(
      `/api/chats?sort=createdAt&limit=2&cursor=${encodeURIComponent(
        firstBody.nextCursor as string
      )}`
    );
    const nextBody = (await next.json()) as {
      chats: ChatResponse[];
      nextCursor: string | null;
    };
    expect(nextBody.chats.map((c) => c.sourceId)).toEqual(["c1"]);
    expect(nextBody.nextCursor).toBeNull();
  });

  it("rejects an invalid sort with 400", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
      pageQuery: createChatPageQuery({ dataDir }),
    });
    const res = await app.request("/api/chats?sort=bogus&limit=2");
    expect(res.status).toBe(400);
  });
});

describe("Chat id is the public API handle", () => {
  it("GET /api/chats exposes id as the wire-form chat id plus sourceId", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const chat = body.chats.find((s) => s.sourceId === "session-1");
    expect(chat?.id).toBe(wireId);
    expect(chat?.id.startsWith("clog_")).toBe(true);
  });

  it("GET /api/chats/:id 404s when given the source id instead of the chat id", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m1",
      role: "user",
      ts: new Date(1700000100000),
      text: "hi",
      blocks: [{ type: "text", text: "hi" }],
    });

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const res = await app.request("/api/chats/session-1");
    expect(res.status).toBe(404);
  });

  it("GET /api/chats/:id resolves messages by the wire-form chat id", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m1",
      role: "user",
      ts: new Date(1700000100000),
      text: "hi",
      blocks: [{ type: "text", text: "hi" }],
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const res = await app.request(`/api/chats/${wireId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: MessageResponse[] };
    expect(body.messages).toHaveLength(1);
  });
});

describe("Soft delete and restore (archive-backed)", () => {
  it("ignores the legacy includeDeleted query param", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    await app.request(`/api/chats/${wireId}`, { method: "DELETE" });

    const res = await app.request("/api/chats?includeDeleted=true");
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((s) => s.sourceId)).not.toContain("session-1");
  });

  it("hides a session from GET /api/chats after DELETE", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const del = await app.request(`/api/chats/${wireId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((s) => s.sourceId)).not.toContain("session-1");
  });

  it("restores a previously deleted session", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    await app.request(`/api/chats/${wireId}`, { method: "DELETE" });
    const restore = await app.request(`/api/chats/${wireId}/restore`, {
      method: "POST",
    });
    expect(restore.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((s) => s.sourceId)).toContain("session-1");
  });

  it("never deletes archive.sessions rows on soft delete", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    await app.request(`/api/chats/${wireId}`, { method: "DELETE" });

    const row = archive.read.findChatBySourceId("session-1");
    expect(row?.sourceId).toBe("session-1");
  });
});

describe("GET /api/chats/:id visibility", () => {
  it("returns 404 for a trashed session by default", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m1",
      role: "user",
      ts: new Date(1700000100000),
      text: "hi",
      blocks: [{ type: "text", text: "hi" }],
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    await app.request(`/api/chats/${wireId}`, { method: "DELETE" });

    const res = await app.request(`/api/chats/${wireId}`);
    expect(res.status).toBe(404);
  });

  it("returns messages for a trashed session when includeTrashed=true", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m1",
      role: "user",
      ts: new Date(1700000100000),
      text: "hi",
      blocks: [{ type: "text", text: "hi" }],
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    await app.request(`/api/chats/${wireId}`, { method: "DELETE" });

    const res = await app.request(`/api/chats/${wireId}?includeTrashed=true`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: MessageResponse[] };
    expect(body.messages).toHaveLength(1);
  });

  it("still allows restore on a trashed session regardless of visibility flag", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    await app.request(`/api/chats/${wireId}`, { method: "DELETE" });
    const restore = await app.request(`/api/chats/${wireId}/restore`, {
      method: "POST",
    });
    expect(restore.status).toBe(204);
  });
});

describe("DELETE / restore idempotency (archive-backed)", () => {
  it("returns 404 when DELETE targets a chat absent from archive", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });

    const res = await app.request("/api/chats/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when restore targets a chat absent from archive", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });

    const res = await app.request("/api/chats/nonexistent/restore", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 when deleting an already-deleted session", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });

    const first = await app.request(`/api/chats/${wireId}`, {
      method: "DELETE",
    });
    expect(first.status).toBe(204);
    const second = await app.request(`/api/chats/${wireId}`, {
      method: "DELETE",
    });
    expect(second.status).toBe(204);
  });

  it("returns 204 when restoring a session that was never deleted", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });

    const res = await app.request(`/api/chats/${wireId}/restore`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
  });
});

describe("PATCH /api/chats/:id/title", () => {
  it("updates the custom title and returns it in subsequent GET /api/chats", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m-user",
      role: "user",
      ts: new Date(1700000100000),
      text: "Build a login page",
      blocks: [{ type: "text", text: "Build a login page" }],
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const patch = await app.request(`/api/chats/${wireId}/title`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "My favourite chat" }),
    });
    expect(patch.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.sourceId === "session-1");
    expect(session?.title).toBe("My favourite chat");
  });

  it("clears the custom title when an empty string is sent, reverting to derived", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const internalId = seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m-user",
      role: "user",
      ts: new Date(1700000100000),
      text: "Build a login page",
      blocks: [{ type: "text", text: "Build a login page" }],
    });
    metadata.setCustomTitle(internalId, "Custom");
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const patch = await app.request(`/api/chats/${wireId}/title`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(patch.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.sourceId === "session-1");
    expect(session?.title).toBe("Build a login page");
  });

  it("treats whitespace-only title as a clear", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const internalId = seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    metadata.setCustomTitle(internalId, "Custom");
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const patch = await app.request(`/api/chats/${wireId}/title`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    expect(patch.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.sourceId === "session-1");
    expect(session?.title).toBe("Untitled");
  });

  it("trims whitespace around the saved title", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    await app.request(`/api/chats/${wireId}/title`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "  Padded title  " }),
    });

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.sourceId === "session-1");
    expect(session?.title).toBe("Padded title");
  });

  it("returns 404 when archive has no chat for the given id", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });

    const res = await app.request("/api/chats/nonexistent/title", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when title is not a string", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });

    const wrongType = await app.request(`/api/chats/${wireId}/title`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: 123 }),
    });
    expect(wrongType.status).toBe(400);
  });

  it("returns 400 when title exceeds 200 characters", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");
    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });

    const tooLong = "x".repeat(201);
    const res = await app.request(`/api/chats/${wireId}/title`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: tooLong }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/chats?project= (server-side Project filter)", () => {
  it("filters to a single project", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-a",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });
    seedChat(archive, {
      sourceId: "session-b",
      firstSeenAt: new Date(1700000000000),
      project: "project-b",
    });

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const res = await app.request("/api/chats?project=project-a");
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId)).toEqual(["session-a"]);
  });

  it("unions chats across repeated project params (OR)", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-a",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });
    seedChat(archive, {
      sourceId: "session-b",
      firstSeenAt: new Date(1700000000000),
      project: "project-b",
    });
    seedChat(archive, {
      sourceId: "session-c",
      firstSeenAt: new Date(1700000000000),
      project: "project-c",
    });

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const res = await app.request(
      "/api/chats?project=project-a&project=project-c"
    );
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId).sort()).toEqual([
      "session-a",
      "session-c",
    ]);
  });

  it("selects the (No project) group when project= is empty", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-none",
      firstSeenAt: new Date(1700000000000),
      project: null,
    });
    seedChat(archive, {
      sourceId: "session-a",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const res = await app.request("/api/chats?project=");
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId)).toEqual(["session-none"]);
  });

  it("returns every chat when no project param is given", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-a",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });
    seedChat(archive, {
      sourceId: "session-b",
      firstSeenAt: new Date(1700000000000),
      project: "project-b",
    });

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId).sort()).toEqual([
      "session-a",
      "session-b",
    ]);
  });

  it("composes with includeTrashed within the active view", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-active",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });
    const trashedId = seedChat(archive, {
      sourceId: "session-trashed",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });
    metadata.softDelete(trashedId);

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const main = await app.request("/api/chats?project=project-a");
    const mainBody = (await main.json()) as { chats: ChatResponse[] };
    expect(mainBody.chats.map((c) => c.sourceId)).toEqual(["session-active"]);

    const trash = await app.request(
      "/api/chats?project=project-a&includeTrashed=true"
    );
    const trashBody = (await trash.json()) as { chats: ChatResponse[] };
    expect(trashBody.chats.map((c) => c.sourceId).sort()).toEqual([
      "session-active",
      "session-trashed",
    ]);
  });
});

describe("GET /api/chats?tags= (server-side Tag filter)", () => {
  it("returns only chats holding ALL listed tags (AND intersection)", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    const both = seedChat(archive, {
      sourceId: "session-both",
      firstSeenAt: new Date(1700000000000),
    });
    const bugOnly = seedChat(archive, {
      sourceId: "session-bug",
      firstSeenAt: new Date(1700000000000),
    });
    const bug = tags.createTag("bug", "red");
    const idea = tags.createTag("idea", "violet");
    tags.assignTag(both, bug.id);
    tags.assignTag(both, idea.id);
    tags.assignTag(bugOnly, bug.id);

    const app = createApp({ archive, metadata, tags });
    const res = await app.request(`/api/chats?tags=${bug.id},${idea.id}`);
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId)).toEqual(["session-both"]);
  });

  it("combines the tag filter with the project filter (AND across types)", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    const inA = seedChat(archive, {
      sourceId: "session-a-tagged",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });
    const inB = seedChat(archive, {
      sourceId: "session-b-tagged",
      firstSeenAt: new Date(1700000000000),
      project: "project-b",
    });
    const bug = tags.createTag("bug", "red");
    tags.assignTag(inA, bug.id);
    tags.assignTag(inB, bug.id);

    const app = createApp({ archive, metadata, tags });
    const res = await app.request(
      `/api/chats?tags=${bug.id}&project=project-a`
    );
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId)).toEqual(["session-a-tagged"]);
  });

  it("selects the Untagged group when tags= is empty", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-bare",
      firstSeenAt: new Date(1700000000000),
    });
    const tagged = seedChat(archive, {
      sourceId: "session-tagged",
      firstSeenAt: new Date(1700000000000),
    });
    const bug = tags.createTag("bug", "red");
    tags.assignTag(tagged, bug.id);

    const app = createApp({ archive, metadata, tags });
    const res = await app.request("/api/chats?tags=");
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId)).toEqual(["session-bare"]);
  });

  it("returns every chat when no tags param is given", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    const a = seedChat(archive, {
      sourceId: "session-a",
      firstSeenAt: new Date(1700000000000),
    });
    seedChat(archive, {
      sourceId: "session-b",
      firstSeenAt: new Date(1700000000000),
    });
    const bug = tags.createTag("bug", "red");
    tags.assignTag(a, bug.id);

    const app = createApp({ archive, metadata, tags });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((c) => c.sourceId).sort()).toEqual([
      "session-a",
      "session-b",
    ]);
  });
});

describe("GET /api/chats/:id (route status mapping)", () => {
  it("returns 404 when archive has no chat for the given id", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const app = createApp({
      archive,
      metadata,
      tags: createTagRepository({ dataDir }),
    });
    const res = await app.request("/api/chats/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("Tag API", () => {
  function setup() {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    const app = createApp({ archive, metadata, tags });
    return { archive, metadata, tags, app };
  }

  it("POST /api/tags creates a tag and lists it via GET /api/tags", async () => {
    const { app } = setup();

    const created = await app.request("/api/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "bug", color: "red" }),
    });
    expect(created.status).toBe(201);
    const { tag } = (await created.json()) as { tag: Tag };
    expect(tag).toMatchObject({ name: "bug", color: "red" });

    const list = await app.request("/api/tags");
    const { tags } = (await list.json()) as { tags: Tag[] };
    expect(tags).toEqual([tag]);
  });

  it("POST /api/tags rejects a color outside the palette with 400", async () => {
    const { app } = setup();

    const res = await app.request("/api/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "bug", color: "#ff0000" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/tags/:id renames and recolors a tag", async () => {
    const { app, tags } = setup();
    const tag = tags.createTag("bug", "red");

    const res = await app.request(`/api/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "defect", color: "blue" }),
    });
    expect(res.status).toBe(204);
    expect(tags.listTags()).toEqual([
      { id: tag.id, name: "defect", color: "blue" },
    ]);
  });

  it("PATCH /api/tags/:id 404s for an unknown tag", async () => {
    const { app } = setup();

    const res = await app.request("/api/tags/ghost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/tags/:id rejects a color outside the palette with 400", async () => {
    const { app, tags } = setup();
    const tag = tags.createTag("bug", "red");

    const res = await app.request(`/api/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color: "#abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/tags/:id removes it from chats and reports the count", async () => {
    const { archive, app, tags } = setup();
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");
    const tag = tags.createTag("bug", "red");
    await app.request(`/api/chats/${wireId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });

    const res = await app.request(`/api/tags/${tag.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removedFromChats: 1 });
    expect(tags.listTags()).toEqual([]);
  });

  it("DELETE /api/tags/:id 404s for an unknown tag", async () => {
    const { app } = setup();

    const res = await app.request("/api/tags/ghost", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("POST /api/chats/:id/tags assigns a tag to the chat", async () => {
    const { archive, app, tags } = setup();
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");
    const tag = tags.createTag("bug", "red");

    const res = await app.request(`/api/chats/${wireId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    expect(res.status).toBe(204);

    const row = archive.read.findChatBySourceId("session-1")!;
    expect(tags.listTagsForChat(row.id)).toEqual([tag]);
  });

  it("POST /api/chats/:id/tags 404s for an unknown chat", async () => {
    const { app, tags } = setup();
    const tag = tags.createTag("bug", "red");

    const res = await app.request("/api/chats/clog_zzzzzz/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagId: tag.id }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/chats/:id/tags 404s for an unknown tag", async () => {
    const { archive, app } = setup();
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");

    const res = await app.request(`/api/chats/${wireId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagId: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("GET /api/chats embeds each chat's assigned tags", async () => {
    const { archive, app, tags } = setup();
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const row = archive.read.findChatBySourceId("session-1")!;
    const bug = tags.createTag("bug", "red");
    const idea = tags.createTag("idea", "violet");
    tags.assignTag(row.id, bug.id);
    tags.assignTag(row.id, idea.id);

    const res = await app.request("/api/chats");
    const body = (await res.json()) as {
      chats: Array<{ sourceId: string; tags: Tag[] }>;
    };
    const chat = body.chats.find((c) => c.sourceId === "session-1");
    expect(chat?.tags).toEqual([bug, idea]);
  });

  it("GET /api/chats returns an empty tags array for an untagged chat", async () => {
    const { archive, app } = setup();
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const res = await app.request("/api/chats");
    const body = (await res.json()) as {
      chats: Array<{ sourceId: string; tags: Tag[] }>;
    };
    expect(body.chats.find((c) => c.sourceId === "session-1")?.tags).toEqual(
      []
    );
  });

  it("DELETE /api/chats/:id/tags/:tagId removes the assignment", async () => {
    const { archive, app, tags } = setup();
    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const wireId = wireIdFor(archive, "session-1");
    const tag = tags.createTag("bug", "red");
    const row = archive.read.findChatBySourceId("session-1")!;
    tags.assignTag(row.id, tag.id);

    const res = await app.request(`/api/chats/${wireId}/tags/${tag.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(tags.listTagsForChat(row.id)).toEqual([]);
  });
});
