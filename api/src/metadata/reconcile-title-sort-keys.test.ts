import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createArchiveRepository } from "../archive/repository.js";
import { createMetadataRepository } from "./repository.js";
import { computeSortKey } from "./title-sort-key.js";
import { reconcileTitleSortKeys } from "./reconcile-title-sort-keys.js";

const AGENT = "claude-code";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-recon-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function seedChat(
  archive: ReturnType<typeof createArchiveRepository>,
  sourceId: string,
  firstSeenAt: Date
): string {
  return archive.ensureChat(AGENT, sourceId, firstSeenAt);
}

function seedUserMessage(
  archive: ReturnType<typeof createArchiveRepository>,
  sourceId: string,
  text: string,
  ts: Date
): void {
  const raw = archive.insertRawMessage({
    agent: AGENT,
    sourceId,
    sourcePath: "/dev/null",
    sourceLocator: `${sourceId}:${ts.getTime()}`,
    payload: { text },
    ingestedAt: ts,
  });
  archive.upsertNormalizedMessage({
    agent: AGENT,
    sourceId,
    rawId: raw.id,
    message: {
      messageId: `${sourceId}-${ts.getTime()}`,
      role: "user",
      ts: ts.toISOString(),
      text,
      blocks: [{ type: "text", text }],
    },
  });
}

describe("reconcileTitleSortKeys — backfill from the Archive", () => {
  it("writes a sort key from each chat's first user message first line", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const id = seedChat(archive, "c1", new Date(1_000));
    // Only the first line of the earliest user message becomes the title.
    seedUserMessage(archive, "c1", "Hello world\nsecond line", new Date(1_000));

    reconcileTitleSortKeys({ archive, metadata });

    const keys = metadata.getTitleSortKey(id);
    expect(keys?.textKey).toBe(computeSortKey("Hello world"));
    // With no custom title, sort_key mirrors text_key.
    expect(keys?.sortKey).toBe(computeSortKey("Hello world"));
  });

  it("falls back to Untitled for a chat with no user message", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const id = seedChat(archive, "empty", new Date(1_000));

    reconcileTitleSortKeys({ archive, metadata });

    const keys = metadata.getTitleSortKey(id);
    expect(keys?.sortKey).toBe(computeSortKey("Untitled"));
  });

  it("gives every chat a row so the title INNER JOIN never drops one", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const a = seedChat(archive, "a", new Date(1_000));
    const b = seedChat(archive, "b", new Date(2_000));
    seedUserMessage(archive, "a", "alpha", new Date(1_000));

    reconcileTitleSortKeys({ archive, metadata });

    expect(metadata.getTitleSortKey(a)).not.toBeNull();
    expect(metadata.getTitleSortKey(b)).not.toBeNull();
  });
});

describe("custom title maintenance of the sort key (ADR-0019)", () => {
  it("overrides sort_key with the custom title, leaving text_key intact", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const id = seedChat(archive, "c1", new Date(1_000));
    seedUserMessage(archive, "c1", "first message", new Date(1_000));
    reconcileTitleSortKeys({ archive, metadata });

    metadata.setCustomTitle(id, "Zzz Custom");

    const keys = metadata.getTitleSortKey(id);
    // The effective key now follows the custom title...
    expect(keys?.sortKey).toBe(computeSortKey("Zzz Custom"));
    // ...but the first-user-text key is preserved for an O(1) fallback on clear.
    expect(keys?.textKey).toBe(computeSortKey("first message"));
  });

  it("restores sort_key from text_key when the custom title is cleared", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const id = seedChat(archive, "c1", new Date(1_000));
    seedUserMessage(archive, "c1", "first message", new Date(1_000));
    reconcileTitleSortKeys({ archive, metadata });

    metadata.setCustomTitle(id, "Zzz Custom");
    metadata.setCustomTitle(id, null);

    // Clearing falls back to the first-user-text key, no message re-scan needed.
    expect(metadata.getTitleSortKey(id)?.sortKey).toBe(
      computeSortKey("first message")
    );
  });

  it("does not let re-ingest clobber a custom-title override", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });

    const id = seedChat(archive, "c1", new Date(1_000));
    seedUserMessage(archive, "c1", "original", new Date(1_000));
    reconcileTitleSortKeys({ archive, metadata });
    metadata.setCustomTitle(id, "Pinned");

    // A later ingest changes the first user message and reconciles again.
    seedUserMessage(archive, "c1", "edited first line", new Date(500));
    reconcileTitleSortKeys({ archive, metadata });

    const keys = metadata.getTitleSortKey(id);
    // sort_key still honors the custom title; only the fallback text_key moves.
    expect(keys?.sortKey).toBe(computeSortKey("Pinned"));
    expect(keys?.textKey).toBe(computeSortKey("edited first line"));
  });
});
