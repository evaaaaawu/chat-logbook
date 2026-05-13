import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "./repository.js";
import { CROCKFORD_ALPHABET } from "./short-code.js";
import { sessions } from "./schema.js";

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

  it("generateShortCode avoids existing sessions.short_code values", () => {
    const repo = createArchiveRepository({ dataDir });
    const allowed = new Set(CROCKFORD_ALPHABET);

    const first = repo.generateShortCode();
    expect(first).toHaveLength(6);
    for (const ch of first) expect(allowed.has(ch)).toBe(true);

    repo.db
      .insert(sessions)
      .values({
        id: "id-1",
        shortCode: first,
        agent: "claude-code",
        sourceSessionId: "a",
        firstSeenAt: new Date(),
      })
      .run();

    for (let i = 0; i < 20; i++) {
      expect(repo.generateShortCode()).not.toBe(first);
    }

    repo.close();
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
