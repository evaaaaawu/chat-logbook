import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCheckpointRepository } from "./repository.js";
import { chatScanState } from "./schema.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-checkpoint-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("CheckpointRepository", () => {
  it("creates checkpoint.db with a chat_scan_state table and its unique index", () => {
    const repo = createCheckpointRepository({ dataDir });
    repo.close();

    expect(fs.existsSync(path.join(dataDir, "checkpoint.db"))).toBe(true);

    const sqlite = new Database(path.join(dataDir, "checkpoint.db"), {
      readonly: true,
    });
    try {
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toContain("chat_scan_state");

      const indexes = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chat_scan_state'"
        )
        .all() as { name: string }[];
      expect(indexes.map((i) => i.name)).toContain("chat_scan_state_idx");
    } finally {
      sqlite.close();
    }
  });

  it("round-trips a scan watermark and updates it in place for the same (agent, source_id)", () => {
    const repo = createCheckpointRepository({ dataDir });

    expect(repo.getScanState("claude-code", "src-1")).toBeUndefined();

    const firstScannedAt = new Date(1_700_000_000_000);
    repo.recordScanState(
      "claude-code",
      "src-1",
      "/src/one.jsonl",
      { mtimeMs: 1000, sizeBytes: 4096 },
      firstScannedAt
    );

    expect(repo.getScanState("claude-code", "src-1")).toEqual({
      lastMtimeMs: 1000,
      lastSizeBytes: 4096,
      lastScannedAt: firstScannedAt,
    });

    // A later scan of the same file updates the watermark, not appends a row.
    const secondScannedAt = new Date(1_700_000_060_000);
    repo.recordScanState(
      "claude-code",
      "src-1",
      "/src/one.jsonl",
      { mtimeMs: 2000, sizeBytes: 8192 },
      secondScannedAt
    );

    expect(repo.getScanState("claude-code", "src-1")).toEqual({
      lastMtimeMs: 2000,
      lastSizeBytes: 8192,
      lastScannedAt: secondScannedAt,
    });
    expect(repo.db.select().from(chatScanState).all()).toHaveLength(1);

    repo.close();
  });
});
