import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createChatReader } from "./chat-reader.js";
import { createArchiveRepository } from "./archive/repository.js";
import { createMetadataRepository } from "./metadata/repository.js";
import {
  chats as archiveChats,
  rawMessages as archiveRawMessages,
  messages as archiveMessages,
} from "./archive/schema.js";

const DEFAULT_AGENT = "claude-code";

function seedChat(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    internalId: string;
    sourceId: string;
    firstSeenAt: Date;
    agent?: string;
    project?: string | null;
    projectPath?: string | null;
  }
): void {
  archive.db
    .insert(archiveChats)
    .values({
      id: opts.internalId,
      chatId: opts.internalId.slice(0, 6).toUpperCase(),
      agent: opts.agent ?? DEFAULT_AGENT,
      sourceId: opts.sourceId,
      firstSeenAt: opts.firstSeenAt,
      project: opts.project ?? null,
      projectPath: opts.projectPath ?? null,
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
    agent?: string;
  }
): void {
  const agent = opts.agent ?? DEFAULT_AGENT;
  const rawRow = archive.db
    .insert(archiveRawMessages)
    .values({
      agent,
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
      agent,
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
    agent?: string;
  }
): void {
  archive.db
    .insert(archiveRawMessages)
    .values({
      agent: opts.agent ?? DEFAULT_AGENT,
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
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({ includeTrashed: false });
    expect(chats.map((c) => c.id)).toContain("session-1");
  });

  it("surfaces project from the archive chat row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: "project-a",
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.project).toBe("project-a");
  });

  it("derives title from the first user message when no customTitle", () => {
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

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.title).toBe("Build a login page");
  });

  it("prefers customTitle over the derived title", () => {
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

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.title).toBe("My favourite chat");
  });

  it("falls back to Untitled when there are no user messages and no customTitle", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.title).toBe("Untitled");
  });

  it("sets createdAt to MIN(ts) and updatedAt to MAX(ts) when messages exist", () => {
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

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.createdAt).toBe(1700000100000);
    expect(chat?.updatedAt).toBe(1700000500000);
  });

  it("falls back createdAt and updatedAt to firstSeenAt when there are no messages", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.createdAt).toBe(1700000000000);
    expect(chat?.updatedAt).toBe(1700000000000);
  });

  it("returns chatId from the archive chat row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    // seedChat assigns chatId = internalId.slice(0, 6).toUpperCase()
    expect(chat?.chatId).toBe("INTERN");
  });

  it("returns sourceFilePath from the most-recently-ingested raw row", () => {
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

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.sourceFilePath).toBe("/new/path.jsonl");
  });

  it("returns sourceFilePath as null when no raw rows exist for the chat", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.sourceFilePath).toBeNull();
  });

  it("returns agent as the raw agent id from the chat row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.agent).toBe("claude-code");
  });

  it("returns projectPath with the full cwd when set on the chat row", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: "chat-logbook",
      projectPath: "/Users/evaaaaawu/Documents/chat-logbook",
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.projectPath).toBe("/Users/evaaaaawu/Documents/chat-logbook");
  });

  it("returns projectPath as null when no cwd was discoverable", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.projectPath).toBeNull();
  });

  it("falls back to empty string when project is null", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
      project: null,
    });

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: false })
      .find((c) => c.id === "session-1");
    expect(chat?.project).toBe("");
  });
});

describe("ChatReader visibility", () => {
  it("excludes trashed chats by default", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    metadata.softDelete("internal-uuid-1");

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({ includeTrashed: false });
    expect(chats.map((c) => c.id)).not.toContain("session-1");
  });

  it("includes trashed chats with isDeleted flag when includeTrashed", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "internal-uuid-1",
      sourceId: "session-1",
      firstSeenAt: new Date(1700000000000),
    });
    metadata.softDelete("internal-uuid-1");

    const reader = createChatReader({ archive, metadata });
    const chat = reader
      .listChats({ includeTrashed: true })
      .find((c) => c.id === "session-1");
    expect(chat?.isDeleted).toBe(true);
  });

  it("exposes deletedAt null for active chats and a timestamp for trashed chats", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    seedChat(archive, {
      internalId: "active-uuid-1",
      sourceId: "session-active",
      firstSeenAt: new Date(1700000000000),
    });
    seedChat(archive, {
      internalId: "trashd-uuid-1",
      sourceId: "session-trashed",
      firstSeenAt: new Date(1700000000000),
    });
    const before = Date.now();
    metadata.softDelete("trashd-uuid-1");

    const reader = createChatReader({ archive, metadata });
    const chats = reader.listChats({ includeTrashed: true });
    const active = chats.find((c) => c.id === "session-active");
    const trashed = chats.find((c) => c.id === "session-trashed");
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

    const reader = createChatReader({ archive, metadata });
    const messages = reader.getMessages("session-1", { includeTrashed: false });
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
    metadata.softDelete("internal-uuid-1");

    const reader = createChatReader({ archive, metadata });
    expect(
      reader.getMessages("session-1", { includeTrashed: false })
    ).toBeNull();
  });

  it("returns null for an absent chat id", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const reader = createChatReader({ archive, metadata });
    expect(
      reader.getMessages("does-not-exist", { includeTrashed: false })
    ).toBeNull();
  });

  it("maps tool_result blocks back to snake_case for the API contract", () => {
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

    const reader = createChatReader({ archive, metadata });
    const messages = reader.getMessages("session-1", { includeTrashed: false });
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
      internalId: "internal-uuid-1",
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
      .find((c) => c.id === "session-codex");
    expect(chat?.agent).toBe("codex");
    expect(chat?.title).toBe("Hello from Codex");

    const messages = reader.getMessages("session-codex", {
      includeTrashed: false,
    });
    expect(messages).toHaveLength(1);
    expect(messages![0].content).toEqual([
      { type: "text", text: "Hello from Codex" },
    ]);
  });
});
