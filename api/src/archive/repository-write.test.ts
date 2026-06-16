import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "./repository.js";
import { chats, ingestionEvents, messages, rawMessages } from "./schema.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "chat-logbook-archive-write-")
  );
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("ArchiveRepository write seam", () => {
  it("insertRawMessage inserts once and dedupes a repeat (agent, source_id, payload_hash)", () => {
    const repo = createArchiveRepository({ dataDir });
    const input = {
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/src/session-1.jsonl",
      sourceLocator: "line:1",
      payload: { role: "user", content: "hello" },
      ingestedAt: new Date(),
    };

    const first = repo.insertRawMessage(input);
    expect(first.inserted).toBe(true);
    expect(first.id).toBeTypeOf("number");

    const second = repo.insertRawMessage(input);
    expect(second.inserted).toBe(false);
    expect(second.id).toBe(first.id);

    repo.close();
  });

  it("insertRawMessage appends a new row when the payload differs", () => {
    const repo = createArchiveRepository({ dataDir });
    const base = {
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/src/session-1.jsonl",
      sourceLocator: "line:1",
      ingestedAt: new Date(),
    };

    const first = repo.insertRawMessage({
      ...base,
      payload: { role: "user", content: "hello" },
    });
    const second = repo.insertRawMessage({
      ...base,
      payload: { role: "user", content: "goodbye" },
    });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(true);
    expect(second.id).not.toBe(first.id);

    repo.close();
  });

  it("upsertNormalizedMessage inserts a message when none exists for the canonical key", () => {
    const repo = createArchiveRepository({ dataDir });
    const raw = repo.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/src/session-1.jsonl",
      sourceLocator: "line:1",
      payload: { role: "user", content: "hello" },
      ingestedAt: new Date(),
    });

    const upserted = repo.upsertNormalizedMessage({
      agent: "claude-code",
      sourceId: "session-1",
      message: {
        messageId: "m1",
        role: "user",
        ts: "2024-01-01T00:00:00Z",
        text: "hello",
        blocks: [{ type: "text", text: "hello" }],
      },
      rawId: raw.id,
    });

    expect(upserted).toBe(true);

    const rows = repo.db.select().from(messages).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].messageId).toBe("m1");
    expect(rows[0].text).toBe("hello");
    expect(rows[0].ts.getTime()).toBe(
      new Date("2024-01-01T00:00:00Z").getTime()
    );

    repo.close();
  });

  it("upsertNormalizedMessage is last-write-wins: a newer ts overwrites, an older ts is dropped", () => {
    const repo = createArchiveRepository({ dataDir });
    const raw = repo.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/src/session-1.jsonl",
      sourceLocator: "line:1",
      payload: { role: "user", content: "v1" },
      ingestedAt: new Date(),
    });

    const base = {
      agent: "claude-code",
      sourceId: "session-1",
      rawId: raw.id,
    };

    repo.upsertNormalizedMessage({
      ...base,
      message: {
        messageId: "m1",
        role: "user",
        ts: "2024-01-01T00:00:00Z",
        text: "v1",
        blocks: [{ type: "text", text: "v1" }],
      },
    });

    // Newer ts wins.
    const newer = repo.upsertNormalizedMessage({
      ...base,
      message: {
        messageId: "m1",
        role: "user",
        ts: "2024-01-02T00:00:00Z",
        text: "v2",
        blocks: [{ type: "text", text: "v2" }],
      },
    });
    expect(newer).toBe(true);

    // Older ts is dropped.
    const older = repo.upsertNormalizedMessage({
      ...base,
      message: {
        messageId: "m1",
        role: "user",
        ts: "2023-12-31T00:00:00Z",
        text: "stale",
        blocks: [{ type: "text", text: "stale" }],
      },
    });
    expect(older).toBe(false);

    const rows = repo.db.select().from(messages).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("v2");
    expect(rows[0].ts.getTime()).toBe(
      new Date("2024-01-02T00:00:00Z").getTime()
    );

    repo.close();
  });

  it("ensureChat returns a stable id and back-fills project/projectPath on a later call", () => {
    const repo = createArchiveRepository({ dataDir });

    // First seen with no project info.
    const id = repo.ensureChat("claude-code", "session-1", new Date());
    expect(id).toBeTypeOf("string");

    const beforeRow = repo.db
      .select()
      .from(chats)
      .where(eq(chats.id, id))
      .get();
    expect(beforeRow?.project).toBeNull();
    expect(beforeRow?.chatId).toHaveLength(6);

    // Later scan resolves the project: same id, fields filled in.
    const again = repo.ensureChat(
      "claude-code",
      "session-1",
      new Date(),
      "project-a",
      "/Users/test/project-a"
    );
    expect(again).toBe(id);

    const afterRow = repo.db.select().from(chats).where(eq(chats.id, id)).get();
    expect(afterRow?.project).toBe("project-a");
    expect(afterRow?.projectPath).toBe("/Users/test/project-a");

    // Still a single chat row for the canonical (agent, source_id).
    expect(repo.db.select().from(chats).all()).toHaveLength(1);

    repo.close();
  });

  it("recordIngestionEvent writes an audit row and never deletes archive rows", () => {
    const repo = createArchiveRepository({ dataDir });

    // An existing raw row that must survive an unlink audit (ADR-0002).
    const raw = repo.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/src/session-1.jsonl",
      sourceLocator: "line:1",
      payload: { role: "user", content: "hello" },
      ingestedAt: new Date(),
    });

    repo.recordIngestionEvent({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/src/session-1.jsonl",
      eventType: "unlink_observed",
      detail: { path: "/src/session-1.jsonl" },
    });

    const events = repo.db.select().from(ingestionEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("unlink_observed");
    expect(events[0].sourceId).toBe("session-1");
    expect(events[0].detail).toEqual({ path: "/src/session-1.jsonl" });

    // The unlink audit leaves the archive rows untouched.
    const rawRows = repo.db.select().from(rawMessages).all();
    expect(rawRows).toHaveLength(1);
    expect(rawRows[0].id).toBe(raw.id);

    repo.close();
  });
});
