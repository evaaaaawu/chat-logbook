import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createChatReader } from "./chat-reader.js";
import { createArchiveRepository } from "./archive/repository.js";
import { createMetadataRepository } from "./metadata/repository.js";
import { CROCKFORD_ALPHABET, formatChatId } from "./archive/chat-id.js";
import type { ArchiveReadSeam } from "./archive/read-seam.js";

const DEFAULT_AGENT = "claude-code";

// The public handle is the wire-form chat id. Tests seed by source id, so this
// looks up the chat's generated chat_id and renders the wire form callers pass
// to findChat / getMessages.
function wireIdFor(
  archive: ReturnType<typeof createArchiveRepository>,
  sourceId: string
): string {
  const row = archive.read.findChatBySourceId(sourceId);
  if (!row) throw new Error(`no seeded chat for source id ${sourceId}`);
  return formatChatId(row.chatId);
}

/**
 * Seed a chat through the write seam; returns the generated internal id so
 * callers can pass it to metadata writes.
 */
function seedChat(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    sourceId: string;
    firstSeenAt: Date;
    agent?: string;
    project?: string | null;
    projectPath?: string | null;
  }
): string {
  return archive.ensureChat(
    opts.agent ?? DEFAULT_AGENT,
    opts.sourceId,
    opts.firstSeenAt,
    opts.project ?? undefined,
    opts.projectPath ?? undefined
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
    agent?: string;
  }
): void {
  const agent = opts.agent ?? DEFAULT_AGENT;
  archive.ensureChat(agent, opts.sourceId, opts.ts);
  const raw = archive.insertRawMessage({
    agent,
    sourceId: opts.sourceId,
    sourcePath: "/dev/null",
    sourceLocator: `${opts.messageId}:0`,
    payload: { id: opts.messageId },
    ingestedAt: opts.ts,
  });
  archive.upsertNormalizedMessage({
    agent,
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

function seedRawMessage(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    sourceId: string;
    sourcePath: string;
    payloadKey: string;
    ingestedAt: Date;
    agent?: string;
  }
): void {
  const agent = opts.agent ?? DEFAULT_AGENT;
  archive.ensureChat(agent, opts.sourceId, opts.ingestedAt);
  archive.insertRawMessage({
    agent,
    sourceId: opts.sourceId,
    sourcePath: opts.sourcePath,
    sourceLocator: `${opts.payloadKey}:0`,
    // The key only needs to make payloads unique so the content-hash dedup
    // doesn't merge them; `insertRawMessage` hashes the payload internally.
    payload: { key: opts.payloadKey },
    ingestedAt: opts.ingestedAt,
  });
}

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-reader-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("ChatReader.listChats", () => {
  it("returns chats from the archive even when source JSONL is absent", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({ includeTrashed: false });
    expect(chats.map((c) => c.sourceId)).toContain("session-1");
  });

  it("surfaces project from the archive chat row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.project).toBe("project-a");
  });

  it("derives title from the first user message when no customTitle", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
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

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.title).toBe("Build a login page");
  });

  it("prefers customTitle over the derived title", () => {
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
    metadata.setCustomTitle(internalId, "My favourite chat");

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.title).toBe("My favourite chat");
  });

  it("falls back to Untitled when there are no user messages and no customTitle", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.title).toBe("Untitled");
  });

  it("sets createdAt to MIN(ts) and updatedAt to MAX(ts) when messages exist", () => {
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
    seedMessage(archive, {
      sourceId: "session-1",
      messageId: "m2",
      role: "assistant",
      ts: new Date(1700000500000),
      text: "ok",
      blocks: [{ type: "text", text: "ok" }],
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.createdAt).toBe(1700000100000);
    expect(chat?.updatedAt).toBe(1700000500000);
  });

  it("falls back createdAt and updatedAt to firstSeenAt when there are no messages", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.createdAt).toBe(1700000000000);
    expect(chat?.updatedAt).toBe(1700000000000);
  });

  it("exposes id as the wire-form chat id and sourceId as the source id", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    const code = archive.read.findChatBySourceId("session-1")!.chatId;

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    // id is the public wire-form chat id (clog_ + 6 Crockford chars).
    expect(chat?.id).toBe(`clog_${code}`);
    expect(code).toHaveLength(6);
    const allowed = new Set(CROCKFORD_ALPHABET);
    for (const ch of code) expect(allowed.has(ch)).toBe(true);
    // sourceId carries the source id for display, never as a handle.
    expect(chat?.sourceId).toBe("session-1");
  });

  it("does not expose a chatId field (collapsed into id)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat).toBeDefined();
    expect("chatId" in chat!).toBe(false);
  });

  it("returns sourceFilePath from the most-recently-ingested raw row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    seedRawMessage(archive, {
      sourceId: "session-1",
      sourcePath: "/old/path.jsonl",
      payloadKey: "hash-old",
      ingestedAt: new Date(1700000100000),
    });
    seedRawMessage(archive, {
      sourceId: "session-1",
      sourcePath: "/new/path.jsonl",
      payloadKey: "hash-new",
      ingestedAt: new Date(1700000900000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.sourceFilePath).toBe("/new/path.jsonl");
  });

  it("returns sourceFilePath as null when no raw rows exist for the chat", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.sourceFilePath).toBeNull();
  });

  it("returns agent as the raw agent id from the chat row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.agent).toBe("claude-code");
  });

  it("returns projectPath with the full cwd when set on the chat row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: "chat-logbook",
      projectPath: "/Users/evaaaaawu/Documents/chat-logbook",
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.projectPath).toBe("/Users/evaaaaawu/Documents/chat-logbook");
  });

  it("returns projectPath as null when no cwd was discoverable", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.projectPath).toBeNull();
  });

  it("falls back to empty string when project is null", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: null,
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.project).toBe("");
  });
});

describe("ChatReader.listChats project filter", () => {
  it("returns only chats in the given project", () => {
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

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({
      includeTrashed: false,
      projects: ["project-a"],
    });
    expect(chats.map((c) => c.sourceId)).toEqual(["session-a"]);
  });

  it("returns the union of chats across several projects (OR)", () => {
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

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({
      includeTrashed: false,
      projects: ["project-a", "project-c"],
    });
    expect(chats.map((c) => c.sourceId).sort()).toEqual([
      "session-a",
      "session-c",
    ]);
  });

  it("selects the (No project) group when the filter value is the empty string", () => {
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

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({
      includeTrashed: false,
      projects: [""],
    });
    expect(chats.map((c) => c.sourceId)).toEqual(["session-none"]);
  });

  it("composes the project filter with trash visibility (active view only)", () => {
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

    const reader = createChatReader({ archive, metadata });
    const active = reader.listChats({
      includeTrashed: false,
      projects: ["project-a"],
    });
    expect(active.map((c) => c.sourceId)).toEqual(["session-active"]);

    const trash = reader.listChats({
      includeTrashed: true,
      projects: ["project-a"],
    });
    expect(trash.map((c) => c.sourceId).sort()).toEqual([
      "session-active",
      "session-trashed",
    ]);
  });
});

describe("ChatReader visibility", () => {
  it("excludes trashed chats by default", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const internalId = seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    metadata.softDelete(internalId);

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({ includeTrashed: false });
    expect(chats.map((c) => c.sourceId)).not.toContain("session-1");
  });

  it("includes trashed chats with isDeleted flag when includeTrashed", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const internalId = seedChat(archive, {
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    metadata.softDelete(internalId);

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: true })
      .find((c) => c.sourceId === "session-1");
    expect(chat?.isDeleted).toBe(true);
  });

  it("exposes deletedAt null for active chats and a timestamp for trashed chats", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      sourceId: "session-active",
      firstSeenAt: new Date(1700000000000),
    });
    const trashedId = seedChat(archive, {
      sourceId: "session-trashed",
      firstSeenAt: new Date(1700000000000),
    });
    const before = Date.now();
    metadata.softDelete(trashedId);

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({ includeTrashed: true });
    const active = chats.find((c) => c.sourceId === "session-active");
    const trashed = chats.find((c) => c.sourceId === "session-trashed");
    expect(active?.deletedAt).toBeNull();
    expect(typeof trashed?.deletedAt).toBe("number");
    expect(trashed!.deletedAt!).toBeGreaterThanOrEqual(before);
  });
});

describe("ChatReader.getMessages", () => {
  it("returns messages ordered by ts", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
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

    const reader = createChatReader({ archive, metadata });
    const messages = reader.getMessages(wireIdFor(archive, "session-1"), {
      includeTrashed: false,
    });
    expect(messages).toHaveLength(2);
    expect(messages![0].role).toBe("user");
    expect(messages![0].content).toEqual([
      { type: "text", text: "Build a login page" },
    ]);
    expect(messages![0].timestamp).toBe("2023-11-14T22:15:00.000Z");
    expect(messages![1].role).toBe("assistant");
  });

  it("returns null for a trashed chat by default", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const internalId = seedChat(archive, {
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
    metadata.softDelete(internalId);

    const reader = createChatReader({ archive, metadata });
    expect(reader.getMessages(wireId, { includeTrashed: false })).toBeNull();
  });

  it("returns null for an absent (malformed) chat id", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const reader = createChatReader({ archive, metadata });
    expect(
      reader.getMessages("does-not-exist", { includeTrashed: false })
    ).toBeNull();
  });

  it("returns null when resolved by source id rather than the chat id", () => {
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

    const reader = createChatReader({ archive, metadata });
    // Source id is no longer a public lookup key — only the wire-form chat id is.
    expect(
      reader.getMessages("session-1", { includeTrashed: false })
    ).toBeNull();
  });

  it("returns null when resolved by the bare chat_id code without the prefix", () => {
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
    const bareCode = archive.read.findChatBySourceId("session-1")!.chatId;

    const reader = createChatReader({ archive, metadata });
    // Strict: only the clog_ wire form resolves; the bare code does not.
    expect(reader.getMessages(bareCode, { includeTrashed: false })).toBeNull();
  });

  it("maps tool_result blocks back to snake_case for the API contract", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
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

    const reader = createChatReader({ archive, metadata });
    const messages = reader.getMessages(wireIdFor(archive, "session-1"), {
      includeTrashed: false,
    });
    expect(messages![0].content).toEqual([
      { type: "tool_result", tool_use_id: "tool-1", content: "result" },
    ]);
  });
});

describe("ChatReader is agent-agnostic", () => {
  it("surfaces a non-claude-code agent in the list and its messages", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      sourceId: "session-codex",
      firstSeenAt: new Date(1700000000000),
      agent: "codex",
    });
    seedMessage(archive, {
      sourceId: "session-codex",
      messageId: "m-user",
      role: "user",
      ts: new Date(1700000100000),
      text: "Hello from Codex",
      blocks: [{ type: "text", text: "Hello from Codex" }],
      agent: "codex",
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.sourceId === "session-codex");
    expect(chat?.agent).toBe("codex");
    expect(chat?.title).toBe("Hello from Codex");

    const messages = reader.getMessages(wireIdFor(archive, "session-codex"), {
      includeTrashed: false,
    });
    expect(messages).toHaveLength(1);
    expect(messages![0].content).toEqual([
      { type: "text", text: "Hello from Codex" },
    ]);
  });
});

/**
 * Count how many archive read-seam methods are invoked while `fn` runs.
 * The #106 invariant is "listChats issues a constant number of archive reads
 * regardless of chat count" — each seam method maps to one underlying SQL
 * statement, so a constant call count is the public-surface proxy for the
 * constant SQL-statement count the original raw-handle counter measured.
 */
function countArchiveQueries(
  archive: ReturnType<typeof createArchiveRepository>,
  fn: () => void
): number {
  const seam = archive.read;
  const methods = [
    "listChatRows",
    "findChatBySourceId",
    "listMessagesByChat",
    "listChatTsRanges",
    "listLatestRawSourcePaths",
    "listFirstUserTexts",
    "listIngestionEvents",
  ] as const;
  const originals: Partial<Record<(typeof methods)[number], unknown>> = {};
  let count = 0;
  for (const m of methods) {
    originals[m] = seam[m];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (seam as any)[m] = (...args: unknown[]) => {
      count += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originals[m] as any).call(seam, ...args);
    };
  }
  try {
    fn();
  } finally {
    for (const m of methods) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (seam as unknown as Record<string, unknown>)[m] = originals[
        m
      ] as ArchiveReadSeam[typeof m];
    }
  }
  return count;
}

function seedFullChat(
  archive: ReturnType<typeof createArchiveRepository>,
  metadata: ReturnType<typeof createMetadataRepository>,
  index: number
): void {
  const sourceId = `session-${index}`;
  const internalId = seedChat(archive, {
    sourceId,
    firstSeenAt: new Date(1700000000000 + index),
  });
  seedMessage(archive, {
    sourceId,
    messageId: `m-user-${index}`,
    role: "user",
    ts: new Date(1700000100000 + index),
    text: `Question ${index}`,
    blocks: [{ type: "text", text: `Question ${index}` }],
  });
  seedMessage(archive, {
    sourceId,
    messageId: `m-assistant-${index}`,
    role: "assistant",
    ts: new Date(1700000500000 + index),
    text: `Answer ${index}`,
    blocks: [{ type: "text", text: `Answer ${index}` }],
  });
  seedRawMessage(archive, {
    sourceId,
    sourcePath: `/path/${index}.jsonl`,
    payloadKey: `hash-${index}`,
    ingestedAt: new Date(1700000900000 + index),
  });
  if (index % 2 === 0) {
    metadata.setCustomTitle(internalId, `Custom title ${index}`);
  }
}

describe("ChatReader.listChats query batching", () => {
  it("runs a constant number of archive queries regardless of chat count", () => {
    const archiveSmall = createArchiveRepository({ dataDir });
    const metadataSmall = createMetadataRepository({ dataDir });
    seedFullChat(archiveSmall, metadataSmall, 1);
    const readerSmall = createChatReader({
      archive: archiveSmall,
      metadata: metadataSmall,
    });
    const smallCount = countArchiveQueries(archiveSmall, () => {
      readerSmall.listChats({ includeTrashed: false });
    });

    const bigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "chat-logbook-reader-test-big-")
    );
    try {
      const archiveBig = createArchiveRepository({ dataDir: bigDir });
      const metadataBig = createMetadataRepository({ dataDir: bigDir });
      for (let i = 1; i <= 20; i += 1) {
        seedFullChat(archiveBig, metadataBig, i);
      }
      const readerBig = createChatReader({
        archive: archiveBig,
        metadata: metadataBig,
      });
      const bigCount = countArchiveQueries(archiveBig, () => {
        readerBig.listChats({ includeTrashed: false });
      });

      expect(bigCount).toBe(smallCount);
    } finally {
      fs.rmSync(bigDir, { recursive: true, force: true });
    }
  });

  it("assembles per-chat title, ts-range, and source path correctly across multiple chats", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    // Chat A: derives its title from the first user message, has two raw rows
    // (newest path wins) and a two-message ts-range.
    seedChat(archive, {
      sourceId: "session-a",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-a",
      messageId: "a-user",
      role: "user",
      ts: new Date(1700000100000),
      text: "Title from A",
      blocks: [{ type: "text", text: "Title from A" }],
    });
    seedMessage(archive, {
      sourceId: "session-a",
      messageId: "a-assistant",
      role: "assistant",
      ts: new Date(1700000800000),
      text: "ok",
      blocks: [{ type: "text", text: "ok" }],
    });
    seedRawMessage(archive, {
      sourceId: "session-a",
      sourcePath: "/a/old.jsonl",
      payloadKey: "a-old",
      ingestedAt: new Date(1700000100000),
    });
    seedRawMessage(archive, {
      sourceId: "session-a",
      sourcePath: "/a/new.jsonl",
      payloadKey: "a-new",
      ingestedAt: new Date(1700000900000),
    });

    // Chat B: a custom title overrides its first user message.
    const idB = seedChat(archive, {
      sourceId: "session-b",
      firstSeenAt: new Date(1700000000000),
    });
    seedMessage(archive, {
      sourceId: "session-b",
      messageId: "b-user",
      role: "user",
      ts: new Date(1700000200000),
      text: "Derived B title",
      blocks: [{ type: "text", text: "Derived B title" }],
    });
    seedRawMessage(archive, {
      sourceId: "session-b",
      sourcePath: "/b/only.jsonl",
      payloadKey: "b-only",
      ingestedAt: new Date(1700000300000),
    });
    metadata.setCustomTitle(idB, "Custom B title");

    // Chat C: no messages, no raw rows — falls back to Untitled, null path,
    // and firstSeenAt for both timestamps.
    seedChat(archive, {
      sourceId: "session-c",
      firstSeenAt: new Date(1700000050000),
    });

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({ includeTrashed: false });

    // Ordering mirrors the chat-row insertion order.
    expect(chats.map((c) => c.sourceId)).toEqual([
      "session-a",
      "session-b",
      "session-c",
    ]);

    const a = chats.find((c) => c.sourceId === "session-a")!;
    expect(a.title).toBe("Title from A");
    expect(a.sourceFilePath).toBe("/a/new.jsonl");
    expect(a.createdAt).toBe(1700000100000);
    expect(a.updatedAt).toBe(1700000800000);

    const b = chats.find((c) => c.sourceId === "session-b")!;
    expect(b.title).toBe("Custom B title");
    expect(b.sourceFilePath).toBe("/b/only.jsonl");
    expect(b.createdAt).toBe(1700000200000);
    expect(b.updatedAt).toBe(1700000200000);

    const c = chats.find((c) => c.sourceId === "session-c")!;
    expect(c.title).toBe("Untitled");
    expect(c.sourceFilePath).toBeNull();
    expect(c.createdAt).toBe(1700000050000);
    expect(c.updatedAt).toBe(1700000050000);
  });
});
