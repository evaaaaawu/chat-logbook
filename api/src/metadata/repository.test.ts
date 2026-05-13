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
      lookupInternalId: (agent, sourceSessionId) =>
        agent === "claude-code" && sourceSessionId === "vendor-abc"
          ? "internal-xyz"
          : null,
      ensureSession: () => {
        throw new Error("ensureSession should not be called when lookup hits");
      },
    });

    expect(reopened.isDeleted("internal-xyz")).toBe(true);
    expect(reopened.isDeleted("vendor-abc")).toBe(false);
  });

  it("creates a fresh archive session for legacy rows the archive does not know about", () => {
    const legacy = createMetadataRepository({ dataDir });
    legacy.softDelete("vendor-orphan");

    const ensured: Array<{ agent: string; sourceSessionId: string }> = [];
    const reopened = createMetadataRepository({
      dataDir,
      lookupInternalId: () => null,
      ensureSession: (agent, sourceSessionId) => {
        ensured.push({ agent, sourceSessionId });
        return "internal-newly-created";
      },
    });

    expect(ensured).toEqual([
      { agent: "claude-code", sourceSessionId: "vendor-orphan" },
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
        ensureSession: (_agent, src) => {
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
