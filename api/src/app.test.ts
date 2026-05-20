import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createApp } from "./app.js";
import { createArchiveRepository } from "./archive/repository.js";
import { createMetadataRepository } from "./metadata/repository.js";
import {
  chats as archiveChats,
  rawMessages as archiveRawMessages,
  messages as archiveMessages,
} from "./archive/schema.js";

interface ChatResponse {
  id: string;
  chatId: string;
  agent: string;
  title: string;
  project: string;
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

function seedChat(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    internalId: string;
    sourceId: string;
    firstSeenAt: Date;
    project?: string | null;
  }
): void {
  archive.db
    .insert(archiveChats)
    .values({
      id: opts.internalId,
      chatId: opts.internalId.slice(0, 6).toUpperCase(),
      agent: "claude-code",
      sourceId: opts.sourceId,
      firstSeenAt: opts.firstSeenAt,
      project: opts.project ?? null,
    })
    .run();
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
  const rawRow = archive.db
    .insert(archiveRawMessages)
    .values({
      agent: "claude-code",
      sourceId: opts.sourceId,
      sourcePath: "/dev/null",
      sourceLocator: `${opts.messageId}:0`,
      rawPayload: JSON.stringify({ id: opts.messageId }),
      payloadHash: `hash-${opts.messageId}`,
      ingestedAt: opts.ts,
    })
    .returning({ id: archiveRawMessages.id })
    .get();
  archive.db
    .insert(archiveMessages)
    .values({
      agent: "claude-code",
      sourceId: opts.sourceId,
      messageId: opts.messageId,
      role: opts.role,
      ts: opts.ts,
      text: opts.text,
      blocks: opts.blocks,
      rawId: rawRow.id,
    })
    .run();
}

function seedRawMessage(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    sourceId: string;
    sourcePath: string;
    payloadHash: string;
    ingestedAt: Date;
  }
): void {
  archive.db
    .insert(archiveRawMessages)
    .values({
      agent: "claude-code",
      sourceId: opts.sourceId,
      sourcePath: opts.sourcePath,
      sourceLocator: `${opts.payloadHash}:0`,
      rawPayload: JSON.stringify({ hash: opts.payloadHash }),
      payloadHash: opts.payloadHash,
      ingestedAt: opts.ingestedAt,
    })
    .run();
}

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-app-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/chats (archive-backed)", () => {
  it("returns sessions from archive even when source JSONL is absent", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { chats: ChatResponse[] };
    const ids = body.chats.map((s) => s.id);
    expect(ids).toContain("session-1");
  });

  it("surfaces project from archive.sessions.project", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.project).toBe("project-a");
  });

  it("derives title from the first user message when no customTitle", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m-assistant",
      role: "assistant",
      ts: new Date(1700000200000),
      text: "Sure",
      blocks: [{ type: "text", text: "Sure" }],
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m-user",
      role: "user",
      ts: new Date(1700000100000),
      text: "Build a login page",
      blocks: [{ type: "text", text: "Build a login page" }],
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.title).toBe("Build a login page");
  });

  it("prefers customTitle from data.sessions_meta over derived title", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
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
    metadata.setCustomTitle("internal-uuid-1", "My favourite chat");

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.title).toBe("My favourite chat");
  });

  it("falls back to Untitled when there are no user messages and no customTitle", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.title).toBe("Untitled");
  });

  it("sets createdAt to MIN(messages.ts) and updatedAt to MAX(messages.ts) when messages exist", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
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
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m2",
      role: "assistant",
      ts: new Date(1700000500000),
      text: "ok",
      blocks: [{ type: "text", text: "ok" }],
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.updatedAt).toBe(1700000500000);
    expect(session?.createdAt).toBe(1700000100000);
  });

  it("falls back createdAt and updatedAt to firstSeenAt when there are no messages", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.updatedAt).toBe(1700000000000);
    expect(session?.createdAt).toBe(1700000000000);
  });

  it("returns chatId from chats.chat_id (short code)", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    // seedChat assigns chatId = internalId.slice(0, 6).toUpperCase()
    expect(session?.chatId).toBe("INTERN");
  });

  it("returns sourceFilePath from the most-recently-ingested raw row", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedRawMessage(archive, {
      sourceId: "session-1",
      sourcePath: "/old/path.jsonl",
      payloadHash: "hash-old",
      ingestedAt: new Date(1700000100000),
    });
    seedRawMessage(archive, {
      sourceId: "session-1",
      sourcePath: "/new/path.jsonl",
      payloadHash: "hash-new",
      ingestedAt: new Date(1700000900000),
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.sourceFilePath).toBe("/new/path.jsonl");
  });

  it("returns sourceFilePath as null when no raw rows exist for the chat", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.sourceFilePath).toBeNull();
  });

  it("returns agent as the raw agent id from chats.agent", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.agent).toBe("claude-code");
  });

  it("falls back to empty string when project is null", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: null,
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats");
    const body = (await res.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.project).toBe("");
  });
});

describe("Soft delete and restore (archive-backed)", () => {
  it("ignores the legacy includeDeleted query param", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1", { method: "DELETE" });

    const res = await app.request("/api/chats?includeDeleted=true");
    const body = (await res.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((s) => s.id)).not.toContain("session-1");
  });

  it("hides a session from GET /api/chats after DELETE", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    const del = await app.request("/api/chats/session-1", {
      method: "DELETE",
    });
    expect(del.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((s) => s.id)).not.toContain("session-1");
  });

  it("includes trashed session with isDeleted flag when includeTrashed=true", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1", { method: "DELETE" });

    const res = await app.request("/api/chats?includeTrashed=true");
    const body = (await res.json()) as {
      chats: (ChatResponse & { isDeleted?: boolean })[];
    };
    const s = body.chats.find((x) => x.id === "session-1");
    expect(s?.isDeleted).toBe(true);
  });

  it("restores a previously deleted session", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1", { method: "DELETE" });
    const restore = await app.request("/api/chats/session-1/restore", {
      method: "POST",
    });
    expect(restore.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    expect(body.chats.map((s) => s.id)).toContain("session-1");
  });

  it("never deletes archive.sessions rows on soft delete", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1", { method: "DELETE" });

    const rows = archive.db.select().from(archiveChats).all();
    expect(rows.map((r) => r.sourceId)).toContain("session-1");
  });
});

describe("GET /api/chats/:id visibility", () => {
  it("returns 404 for a trashed session by default", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
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

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1", { method: "DELETE" });

    const res = await app.request("/api/chats/session-1");
    expect(res.status).toBe(404);
  });

  it("returns messages for a trashed session when includeTrashed=true", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
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

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1", { method: "DELETE" });

    const res = await app.request("/api/chats/session-1?includeTrashed=true");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: MessageResponse[] };
    expect(body.messages).toHaveLength(1);
  });

  it("still allows restore on a trashed session regardless of visibility flag", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1", { method: "DELETE" });
    const restore = await app.request("/api/chats/session-1/restore", {
      method: "POST",
    });
    expect(restore.status).toBe(204);
  });
});

describe("DELETE / restore idempotency (archive-backed)", () => {
  it("returns 404 when DELETE targets a session absent from archive", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const app = createApp({ archive, metadata });

    const res = await app.request("/api/chats/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when restore targets a session absent from archive", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const app = createApp({ archive, metadata });

    const res = await app.request("/api/chats/nonexistent/restore", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 when deleting an already-deleted session", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const app = createApp({ archive, metadata });

    const first = await app.request("/api/chats/session-1", {
      method: "DELETE",
    });
    expect(first.status).toBe(204);
    const second = await app.request("/api/chats/session-1", {
      method: "DELETE",
    });
    expect(second.status).toBe(204);
  });

  it("returns 204 when restoring a session that was never deleted", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const app = createApp({ archive, metadata });

    const res = await app.request("/api/chats/session-1/restore", {
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
      internalId: "internal-uuid-1",
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

    const app = createApp({ archive, metadata });
    const patch = await app.request("/api/chats/session-1/title", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "My favourite chat" }),
    });
    expect(patch.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.title).toBe("My favourite chat");
  });

  it("clears the custom title when an empty string is sent, reverting to derived", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
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
    metadata.setCustomTitle("internal-uuid-1", "Custom");

    const app = createApp({ archive, metadata });
    const patch = await app.request("/api/chats/session-1/title", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(patch.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.title).toBe("Build a login page");
  });

  it("treats whitespace-only title as a clear", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    metadata.setCustomTitle("internal-uuid-1", "Custom");

    const app = createApp({ archive, metadata });
    const patch = await app.request("/api/chats/session-1/title", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    expect(patch.status).toBe(204);

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.title).toBe("Untitled");
  });

  it("trims whitespace around the saved title", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const app = createApp({ archive, metadata });
    await app.request("/api/chats/session-1/title", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "  Padded title  " }),
    });

    const list = await app.request("/api/chats");
    const body = (await list.json()) as { chats: ChatResponse[] };
    const session = body.chats.find((s) => s.id === "session-1");
    expect(session?.title).toBe("Padded title");
  });

  it("returns 404 when archive has no session for the given id", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const app = createApp({ archive, metadata });

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
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const app = createApp({ archive, metadata });

    const wrongType = await app.request("/api/chats/session-1/title", {
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
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const app = createApp({ archive, metadata });

    const tooLong = "x".repeat(201);
    const res = await app.request("/api/chats/session-1/title", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: tooLong }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/chats/:id (archive-backed)", () => {
  it("returns messages from archive.messages ordered by ts", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m-assistant",
      role: "assistant",
      ts: new Date(1700000200000),
      text: "Sure",
      blocks: [{ type: "text", text: "Sure" }],
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m-user",
      role: "user",
      ts: new Date(1700000100000),
      text: "Build a login page",
      blocks: [{ type: "text", text: "Build a login page" }],
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats/session-1");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { messages: MessageResponse[] };
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Build a login page" },
    ]);
    expect(body.messages[0].timestamp).toBe("2023-11-14T22:15:00.000Z");
    expect(body.messages[1].role).toBe("assistant");
  });

  it("returns 404 when archive has no session for the given source id", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("maps tool_result blocks back to snake_case for the API contract", async () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m-tool",
      role: "user",
      ts: new Date(1700000100000),
      text: "",
      blocks: [{ type: "tool_result", toolUseId: "tool-1", content: "result" }],
    });

    const app = createApp({ archive, metadata });
    const res = await app.request("/api/chats/session-1");
    const body = (await res.json()) as { messages: MessageResponse[] };
    expect(body.messages[0].content).toEqual([
      { type: "tool_result", tool_use_id: "tool-1", content: "result" },
    ]);
  });
});
