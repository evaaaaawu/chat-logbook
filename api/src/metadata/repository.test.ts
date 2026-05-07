import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMetadataRepository } from "./repository.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("MetadataRepository", () => {
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
});
