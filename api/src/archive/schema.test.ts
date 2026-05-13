import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createArchiveRepository,
  type ArchiveRepository,
} from "./repository.js";
import { ingestionEvents, messages, rawMessages, sessions } from "./schema.js";

let dataDir: string;
let repo: ArchiveRepository;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-archive-"));
  repo = createArchiveRepository({ dataDir });
});

afterEach(() => {
  repo.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("sessions table", () => {
  it("round-trips a session row", () => {
    const now = new Date();
    repo.db
      .insert(sessions)
      .values({
        id: "11111111-1111-4111-8111-111111111111",
        shortCode: "abc234",
        agent: "claude-code",
        sourceSessionId: "src-1",
        firstSeenAt: now,
      })
      .run();

    const row = repo.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, "11111111-1111-4111-8111-111111111111"))
      .get();

    expect(row).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      shortCode: "abc234",
      agent: "claude-code",
      sourceSessionId: "src-1",
    });
    expect(row?.firstSeenAt).toBeInstanceOf(Date);
  });

  it("rejects duplicate (agent, source_session_id)", () => {
    const base = {
      agent: "claude-code",
      sourceSessionId: "dup",
      firstSeenAt: new Date(),
    };
    repo.db
      .insert(sessions)
      .values({ ...base, id: "id-1", shortCode: "aaa111" })
      .run();

    expect(() =>
      repo.db
        .insert(sessions)
        .values({ ...base, id: "id-2", shortCode: "bbb222" })
        .run()
    ).toThrow();
  });

  it("rejects duplicate short_code", () => {
    const now = new Date();
    repo.db
      .insert(sessions)
      .values({
        id: "id-1",
        shortCode: "same11",
        agent: "claude-code",
        sourceSessionId: "a",
        firstSeenAt: now,
      })
      .run();

    expect(() =>
      repo.db
        .insert(sessions)
        .values({
          id: "id-2",
          shortCode: "same11",
          agent: "claude-code",
          sourceSessionId: "b",
          firstSeenAt: now,
        })
        .run()
    ).toThrow();
  });
});

describe("raw_messages table", () => {
  it("round-trips a raw_messages row", () => {
    const now = new Date();
    const inserted = repo.db
      .insert(rawMessages)
      .values({
        agent: "claude-code",
        sessionId: "src-1",
        sourcePath: "/tmp/sess.jsonl",
        sourceLocator: "line:42",
        rawPayload: '{"role":"user","content":"hi"}',
        payloadHash: "deadbeef",
        ingestedAt: now,
      })
      .returning()
      .get();

    expect(inserted).toMatchObject({
      agent: "claude-code",
      sessionId: "src-1",
      rawPayload: '{"role":"user","content":"hi"}',
      payloadHash: "deadbeef",
    });
    expect(inserted.id).toBeTypeOf("number");
  });

  it("rejects duplicate (agent, session_id, payload_hash)", () => {
    const base = {
      agent: "claude-code",
      sessionId: "src-1",
      sourcePath: "/tmp/sess.jsonl",
      sourceLocator: "line:42",
      rawPayload: "{}",
      payloadHash: "h1",
      ingestedAt: new Date(),
    };
    repo.db.insert(rawMessages).values(base).run();

    expect(() => repo.db.insert(rawMessages).values(base).run()).toThrow();
  });
});

describe("messages table", () => {
  it("round-trips a messages row referencing raw_messages", () => {
    const raw = repo.db
      .insert(rawMessages)
      .values({
        agent: "claude-code",
        sessionId: "src-1",
        sourcePath: "/tmp/sess.jsonl",
        sourceLocator: "line:1",
        rawPayload: "{}",
        payloadHash: "h-1",
        ingestedAt: new Date(),
      })
      .returning()
      .get();

    const ts = new Date();
    repo.db
      .insert(messages)
      .values({
        agent: "claude-code",
        sessionId: "src-1",
        messageId: "m-1",
        role: "user",
        ts,
        text: "hello",
        blocks: [{ type: "text", text: "hello" }],
        rawId: raw.id,
      })
      .run();

    const row = repo.db.select().from(messages).get();
    expect(row).toMatchObject({
      messageId: "m-1",
      role: "user",
      text: "hello",
      rawId: raw.id,
    });
    expect(row?.blocks).toEqual([{ type: "text", text: "hello" }]);
  });

  it("rejects duplicate (agent, session_id, message_id)", () => {
    const raw = repo.db
      .insert(rawMessages)
      .values({
        agent: "claude-code",
        sessionId: "src-1",
        sourcePath: "/tmp/sess.jsonl",
        sourceLocator: "line:1",
        rawPayload: "{}",
        payloadHash: "h-1",
        ingestedAt: new Date(),
      })
      .returning()
      .get();

    const base = {
      agent: "claude-code",
      sessionId: "src-1",
      messageId: "m-1",
      role: "user",
      ts: new Date(),
      text: "x",
      blocks: [],
      rawId: raw.id,
    };
    repo.db.insert(messages).values(base).run();

    expect(() => repo.db.insert(messages).values(base).run()).toThrow();
  });
});

describe("ingestion_events table", () => {
  it("round-trips an ingestion_events row", () => {
    repo.db
      .insert(ingestionEvents)
      .values({
        agent: "claude-code",
        sessionId: "src-1",
        sourcePath: "/tmp/sess.jsonl",
        eventType: "unlinked",
        detail: { reason: "file_removed" },
        observedAt: new Date(),
      })
      .run();

    const row = repo.db.select().from(ingestionEvents).get();
    expect(row).toMatchObject({
      agent: "claude-code",
      eventType: "unlinked",
    });
    expect(row?.detail).toEqual({ reason: "file_removed" });
  });
});
