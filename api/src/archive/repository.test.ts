import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "./repository.js";
import { CROCKFORD_ALPHABET } from "./chat-id.js";
import { chats } from "./schema.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-fixtures/v0.7.1"
);

function seedFromFixture(targetDir: string): void {
  fs.copyFileSync(
    path.join(FIXTURE_DIR, "archive.db"),
    path.join(targetDir, "archive.db")
  );
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-archive-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("ArchiveRepository", () => {
  it("creates archive.db and stores a single archive_meta row with a UUID v4 on first run", () => {
    const repo = createArchiveRepository({ dataDir });

    expect(fs.existsSync(path.join(dataDir, "archive.db"))).toBe(true);
    expect(repo.getArchiveUuid()).toMatch(UUID_V4);

    repo.close();
  });

  it("records applied migrations in schema_version", () => {
    const repo = createArchiveRepository({ dataDir });

    const applied = repo.getAppliedMigrations();
    expect(applied.length).toBeGreaterThan(0);
    for (const entry of applied) {
      expect(entry.version).toBeTypeOf("number");
      expect(entry.appliedAt).toBeInstanceOf(Date);
    }

    repo.close();
  });

  it("generateChatId avoids existing chats.chat_id values", () => {
    const repo = createArchiveRepository({ dataDir });
    const allowed = new Set(CROCKFORD_ALPHABET);

    const first = repo.generateChatId();
    expect(first).toHaveLength(6);
    for (const ch of first) expect(allowed.has(ch)).toBe(true);

    repo.db
      .insert(chats)
      .values({
        id: "id-1",
        chatId: first,
        agent: "claude-code",
        sourceId: "a",
        firstSeenAt: new Date(),
      })
      .run();

    for (let i = 0; i < 20; i++) {
      expect(repo.generateChatId()).not.toBe(first);
    }

    repo.close();
  });

  it("migrates a v0.7.1 archive.db: sessions table is renamed to chats with chat_id and source_id columns preserving data", () => {
    seedFromFixture(dataDir);

    const repo = createArchiveRepository({ dataDir });
    repo.close();

    const sqlite = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    try {
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain("chats");
      expect(names).not.toContain("sessions");

      const rows = sqlite
        .prepare(
          "SELECT id, chat_id, agent, source_id, project FROM chats ORDER BY first_seen_at"
        )
        .all() as Array<{
        id: string;
        chat_id: string;
        agent: string;
        source_id: string;
        project: string | null;
      }>;
      expect(rows).toEqual([
        {
          id: "11111111-1111-1111-1111-111111111111",
          chat_id: "AAAA1111",
          agent: "claude-code",
          source_id: "source-session-a",
          project: "/Users/eva/projects/foo",
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          chat_id: "BBBB2222",
          agent: "claude-code",
          source_id: "source-session-b",
          project: null,
        },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("migrates a v0.7.1 archive.db: raw_messages.session_id is renamed to source_id preserving data", () => {
    seedFromFixture(dataDir);

    const repo = createArchiveRepository({ dataDir });
    repo.close();

    const sqlite = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    try {
      const cols = sqlite
        .prepare("PRAGMA table_info('raw_messages')")
        .all() as {
        name: string;
      }[];
      const names = cols.map((c) => c.name);
      expect(names).toContain("source_id");
      expect(names).not.toContain("session_id");

      const rows = sqlite
        .prepare(
          "SELECT source_id, payload_hash FROM raw_messages ORDER BY ingested_at"
        )
        .all() as { source_id: string; payload_hash: string }[];
      expect(rows).toEqual([
        { source_id: "source-session-a", payload_hash: "hash-a-1" },
        { source_id: "source-session-a", payload_hash: "hash-a-2" },
        { source_id: "source-session-b", payload_hash: "hash-b-1" },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("migrates a v0.7.1 archive.db: messages.session_id is renamed to source_id preserving data", () => {
    seedFromFixture(dataDir);

    const repo = createArchiveRepository({ dataDir });
    repo.close();

    const sqlite = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    try {
      const cols = sqlite.prepare("PRAGMA table_info('messages')").all() as {
        name: string;
      }[];
      const names = cols.map((c) => c.name);
      expect(names).toContain("source_id");
      expect(names).not.toContain("session_id");

      const rows = sqlite
        .prepare("SELECT source_id, message_id, role FROM messages ORDER BY ts")
        .all() as { source_id: string; message_id: string; role: string }[];
      expect(rows).toEqual([
        { source_id: "source-session-a", message_id: "msg-a-1", role: "user" },
        {
          source_id: "source-session-a",
          message_id: "msg-a-2",
          role: "assistant",
        },
        { source_id: "source-session-b", message_id: "msg-b-1", role: "user" },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("migrates a v0.7.1 archive.db: session_scan_state.session_id is renamed to source_id preserving data", () => {
    seedFromFixture(dataDir);

    const repo = createArchiveRepository({ dataDir });
    repo.close();

    const sqlite = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    try {
      const cols = sqlite
        .prepare("PRAGMA table_info('session_scan_state')")
        .all() as { name: string }[];
      const names = cols.map((c) => c.name);
      expect(names).toContain("source_id");
      expect(names).not.toContain("session_id");

      const rows = sqlite
        .prepare("SELECT agent, source_id FROM session_scan_state ORDER BY id")
        .all();
      expect(rows).toEqual([
        { agent: "claude-code", source_id: "source-session-a" },
        { agent: "claude-code", source_id: "source-session-b" },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("migrates a v0.7.1 archive.db: ingestion_events.session_id is renamed to source_id preserving data", () => {
    seedFromFixture(dataDir);

    const repo = createArchiveRepository({ dataDir });
    repo.close();

    const sqlite = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    try {
      const cols = sqlite
        .prepare("PRAGMA table_info('ingestion_events')")
        .all() as { name: string }[];
      const names = cols.map((c) => c.name);
      expect(names).toContain("source_id");
      expect(names).not.toContain("session_id");

      const rows = sqlite
        .prepare(
          "SELECT event_type, source_id FROM ingestion_events ORDER BY id"
        )
        .all();
      expect(rows).toEqual([
        { event_type: "discovered", source_id: "source-session-a" },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("migrates a v0.7.1 archive.db: sessions_agent_source_idx is renamed to chats_agent_source_idx", () => {
    seedFromFixture(dataDir);

    const repo = createArchiveRepository({ dataDir });
    repo.close();

    const sqlite = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    try {
      const idx = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chats'"
        )
        .all() as { name: string }[];
      const names = idx.map((i) => i.name);
      expect(names).toContain("chats_agent_source_idx");
      expect(names).not.toContain("sessions_agent_source_idx");
    } finally {
      sqlite.close();
    }
  });

  it("preserves archive_uuid across repository instances", () => {
    const first = createArchiveRepository({ dataDir });
    const original = first.getArchiveUuid();
    first.close();

    const second = createArchiveRepository({ dataDir });
    expect(second.getArchiveUuid()).toBe(original);
    second.close();
  });
});
