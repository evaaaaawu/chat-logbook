import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as checkpointSchema from "../checkpoint/schema.js";
import { openStore } from "./openStore.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-openstore-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("openStore", () => {
  it("creates the data dir, opens the db file, and runs migrations", () => {
    const { sqlite } = openStore({
      dataDir,
      dbFile: "checkpoint.db",
      callerUrl: import.meta.url,
      migrationsSubdir: "drizzle/checkpoint",
      schema: checkpointSchema,
    });

    try {
      expect(fs.existsSync(path.join(dataDir, "checkpoint.db"))).toBe(true);

      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toContain("chat_scan_state");
    } finally {
      sqlite.close();
    }
  });

  it("returns a db handle typed over the passed schema that round-trips writes", () => {
    const { db, sqlite } = openStore({
      dataDir,
      dbFile: "checkpoint.db",
      callerUrl: import.meta.url,
      migrationsSubdir: "drizzle/checkpoint",
      schema: checkpointSchema,
    });

    try {
      db.insert(checkpointSchema.chatScanState)
        .values({
          agent: "claude-code",
          sourceId: "src-1",
          sourcePath: "/src/one.jsonl",
          lastMtimeMs: 1000,
          lastSizeBytes: 4096,
          lastScannedAt: new Date(1_700_000_000_000),
        })
        .run();

      const rows = db.select().from(checkpointSchema.chatScanState).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        agent: "claude-code",
        sourceId: "src-1",
        lastMtimeMs: 1000,
      });
    } finally {
      sqlite.close();
    }
  });

  it("throws when the migrations folder cannot be located relative to callerUrl", () => {
    // A callerUrl deep in a temp dir: neither ../../<subdir> nor ./<subdir>
    // resolves, so resolution relative to the caller must fail loudly.
    const strayCaller = pathToFileURL(
      path.join(dataDir, "nested", "stray.js")
    ).href;

    expect(() =>
      openStore({
        dataDir,
        dbFile: "checkpoint.db",
        callerUrl: strayCaller,
        migrationsSubdir: "drizzle/checkpoint",
        schema: checkpointSchema,
      })
    ).toThrow(/migrations folder/i);
  });
});
