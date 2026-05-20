import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMetadataRepository } from "./repository.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-fixtures/v0.7.1"
);

function seedFromFixture(targetDir: string): void {
  fs.copyFileSync(
    path.join(FIXTURE_DIR, "data.db"),
    path.join(targetDir, "data.db")
  );
}

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("MetadataRepository", () => {
  it("migrates a v0.7.1 data.db: sessions_meta is renamed to chats_meta preserving rows", () => {
    seedFromFixture(dataDir);

    createMetadataRepository({ dataDir });

    const sqlite = new Database(path.join(dataDir, "data.db"), {
      readonly: true,
    });
    try {
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain("chats_meta");
      expect(names).not.toContain("sessions_meta");

      const rows = sqlite
        .prepare(
          "SELECT id, is_deleted, custom_title FROM chats_meta ORDER BY created_at"
        )
        .all();
      expect(rows).toEqual([
        {
          id: "11111111-1111-1111-1111-111111111111",
          is_deleted: 0,
          custom_title: "First chat about foo",
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          is_deleted: 1,
          custom_title: null,
        },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it("marks a session as deleted after softDelete", () => {
    const repo = createMetadataRepository({ dataDir });

    expect(repo.isDeleted("session-1")).toBe(false);

    repo.softDelete("session-1");

    expect(repo.isDeleted("session-1")).toBe(true);
  });

  it("clears the deleted flag after restore", () => {
    const repo = createMetadataRepository({ dataDir });

    repo.softDelete("session-1");
    expect(repo.isDeleted("session-1")).toBe(true);

    repo.restore("session-1");

    expect(repo.isDeleted("session-1")).toBe(false);
  });

  it("persists deleted state across repository instances", () => {
    const first = createMetadataRepository({ dataDir });
    first.softDelete("session-1");

    const second = createMetadataRepository({ dataDir });

    expect(second.isDeleted("session-1")).toBe(true);
  });

  it("returns null for custom title before it is set, and the stored value after", () => {
    const repo = createMetadataRepository({ dataDir });

    expect(repo.getCustomTitle("session-1")).toBeNull();

    repo.setCustomTitle("session-1", "My renamed chat");

    expect(repo.getCustomTitle("session-1")).toBe("My renamed chat");
  });

  it("rekeys legacy vendor-keyed rows to internal ids when archive lookup is provided", () => {
    const legacy = createMetadataRepository({ dataDir });
    legacy.softDelete("vendor-abc");
    expect(legacy.isDeleted("vendor-abc")).toBe(true);

    const reopened = createMetadataRepository({
      dataDir,
      lookupInternalId: (agent, sourceId) =>
        agent === "claude-code" && sourceId === "vendor-abc"
          ? "internal-xyz"
          : null,
      ensureChat: () => {
        throw new Error("ensureChat should not be called when lookup hits");
      },
    });

    expect(reopened.isDeleted("internal-xyz")).toBe(true);
    expect(reopened.isDeleted("vendor-abc")).toBe(false);
  });

  it("creates a fresh archive session for legacy rows the archive does not know about", () => {
    const legacy = createMetadataRepository({ dataDir });
    legacy.softDelete("vendor-orphan");

    const ensured: Array<{ agent: string; sourceId: string }> = [];
    const reopened = createMetadataRepository({
      dataDir,
      lookupInternalId: () => null,
      ensureChat: (agent, sourceId) => {
        ensured.push({ agent, sourceId });
        return "internal-newly-created";
      },
    });

    expect(ensured).toEqual([
      { agent: "claude-code", sourceId: "vendor-orphan" },
    ]);
    expect(reopened.isDeleted("internal-newly-created")).toBe(true);
    expect(reopened.isDeleted("vendor-orphan")).toBe(false);
  });

  it("only runs the rekey migration once across multiple startups", () => {
    const legacy = createMetadataRepository({ dataDir });
    legacy.softDelete("vendor-x");

    let ensureCalls = 0;
    const reopen = () =>
      createMetadataRepository({
        dataDir,
        lookupInternalId: (_agent, src) =>
          src === "vendor-x" ? "internal-x" : null,
        ensureChat: (_agent, src) => {
          ensureCalls++;
          return `ensured-${src}`;
        },
      });

    reopen();
    const third = reopen();

    expect(ensureCalls).toBe(0);
    expect(third.isDeleted("internal-x")).toBe(true);
  });
});
