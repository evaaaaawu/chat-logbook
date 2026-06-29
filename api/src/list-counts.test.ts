import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createChatCountsQuery } from "./list-counts.js";
import { createArchiveRepository } from "./archive/repository.js";
import { createMetadataRepository } from "./metadata/repository.js";
import { createTagRepository } from "./metadata/tags.js";

const DEFAULT_AGENT = "claude-code";

function seedChat(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    sourceId: string;
    firstSeenAt: Date;
    agent?: string;
    project?: string | null;
  }
): string {
  return archive.ensureChat(
    opts.agent ?? DEFAULT_AGENT,
    opts.sourceId,
    opts.firstSeenAt,
    opts.project ?? undefined
  );
}

function seedMessage(
  archive: ReturnType<typeof createArchiveRepository>,
  opts: {
    sourceId: string;
    messageId: string;
    ts: Date;
    role?: "user" | "assistant";
  }
): void {
  const agent = DEFAULT_AGENT;
  archive.ensureChat(agent, opts.sourceId, opts.ts);
  const raw = archive.insertRawMessage({
    agent,
    sourceId: opts.sourceId,
    sourcePath: "/dev/null",
    sourceLocator: `${opts.messageId}:0`,
    payload: { id: opts.messageId },
    ingestedAt: opts.ts,
  });
  archive.upsertNormalizedMessage({
    agent,
    sourceId: opts.sourceId,
    rawId: raw.id,
    message: {
      messageId: opts.messageId,
      role: opts.role ?? "user",
      ts: opts.ts.toISOString(),
      text: "hi",
      blocks: [{ type: "text", text: "hi" }],
    },
  });
}

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-counts-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("ChatCountsQuery.queryCounts — list total", () => {
  it("counts only active chats for the main view (trashed excluded)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    createTagRepository({ dataDir });

    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });
    seedChat(archive, { sourceId: "c2", firstSeenAt: new Date(2_000) });
    const trashedId = seedChat(archive, {
      sourceId: "c3",
      firstSeenAt: new Date(3_000),
    });
    metadata.softDelete(trashedId);

    const countsQuery = createChatCountsQuery({ dataDir });
    const counts = countsQuery.queryCounts({ includeTrashed: false });

    expect(counts.total).toBe(2);

    countsQuery.close();
  });

  it("counts only trashed chats for the Trash view", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    createTagRepository({ dataDir });

    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });
    const trashedA = seedChat(archive, {
      sourceId: "c2",
      firstSeenAt: new Date(2_000),
    });
    const trashedB = seedChat(archive, {
      sourceId: "c3",
      firstSeenAt: new Date(3_000),
    });
    metadata.softDelete(trashedA);
    metadata.softDelete(trashedB);

    const countsQuery = createChatCountsQuery({ dataDir });
    const counts = countsQuery.queryCounts({ includeTrashed: true });

    expect(counts.total).toBe(2);

    countsQuery.close();
  });
});

describe("ChatCountsQuery.queryCounts — Project facets", () => {
  it("counts chats per project, folding null/empty into (No project)", () => {
    const archive = createArchiveRepository({ dataDir });
    createMetadataRepository({ dataDir });
    createTagRepository({ dataDir });

    seedChat(archive, {
      sourceId: "a1",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    seedChat(archive, {
      sourceId: "a2",
      firstSeenAt: new Date(2_000),
      project: "alpha",
    });
    seedChat(archive, {
      sourceId: "b1",
      firstSeenAt: new Date(3_000),
      project: "beta",
    });
    // No project: a null project folds into the "" (No project) bucket.
    seedChat(archive, {
      sourceId: "n1",
      firstSeenAt: new Date(4_000),
      project: null,
    });

    const countsQuery = createChatCountsQuery({ dataDir });
    const counts = countsQuery.queryCounts({ includeTrashed: false });

    const byProject = new Map(counts.projects.map((p) => [p.project, p.count]));
    expect(byProject.get("alpha")).toBe(2);
    expect(byProject.get("beta")).toBe(1);
    expect(byProject.get("")).toBe(1);

    countsQuery.close();
  });

  it("reports each project's most-recent updatedAt as lastActiveAt", () => {
    const archive = createArchiveRepository({ dataDir });
    createMetadataRepository({ dataDir });
    createTagRepository({ dataDir });

    // Two chats in one project; lastActiveAt is the newer updatedAt of the two.
    seedChat(archive, {
      sourceId: "a1",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    seedChat(archive, {
      sourceId: "a2",
      firstSeenAt: new Date(5_000),
      project: "alpha",
    });

    const countsQuery = createChatCountsQuery({ dataDir });
    const counts = countsQuery.queryCounts({ includeTrashed: false });

    const alpha = counts.projects.find((p) => p.project === "alpha");
    expect(alpha?.lastActiveAt).toBe(5_000);

    countsQuery.close();
  });
});

describe("ChatCountsQuery.queryCounts — Tag facets", () => {
  it("counts chats per tag, excluding trashed chats from the main view", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const c1 = seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1) });
    const c2 = seedChat(archive, { sourceId: "c2", firstSeenAt: new Date(2) });
    const c3 = seedChat(archive, { sourceId: "c3", firstSeenAt: new Date(3) });

    const work = tags.createTag("work", "blue");
    const fun = tags.createTag("fun", "violet");

    // work: c1, c2, c3 (one trashed); fun: c1.
    tags.assignTag(c1, work.id);
    tags.assignTag(c2, work.id);
    tags.assignTag(c3, work.id);
    tags.assignTag(c1, fun.id);
    // c3 is trashed, so it drops out of the main view's tag counts.
    metadata.softDelete(c3);

    const countsQuery = createChatCountsQuery({ dataDir });
    const counts = countsQuery.queryCounts({ includeTrashed: false });

    const byTag = new Map(counts.tags.map((t) => [t.tagId, t.count]));
    expect(byTag.get(work.id)).toBe(2); // c1, c2 — not the trashed c3
    expect(byTag.get(fun.id)).toBe(1); // c1

    countsQuery.close();
  });

  it("counts in-view chats holding zero tags as untagged", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const tagged = seedChat(archive, {
      sourceId: "t1",
      firstSeenAt: new Date(1),
    });
    seedChat(archive, { sourceId: "u1", firstSeenAt: new Date(2) });
    const trashed = seedChat(archive, {
      sourceId: "u2",
      firstSeenAt: new Date(3),
    });
    seedChat(archive, { sourceId: "u3", firstSeenAt: new Date(4) });

    const work = tags.createTag("work", "blue");
    tags.assignTag(tagged, work.id);
    // u2 is untagged but trashed — out of the main view's untagged count.
    metadata.softDelete(trashed);

    const countsQuery = createChatCountsQuery({ dataDir });
    const counts = countsQuery.queryCounts({ includeTrashed: false });

    // Untagged in main view: u1, u3 (tagged t1 excluded, trashed u2 excluded).
    expect(counts.untagged).toBe(2);

    countsQuery.close();
  });
});

describe("ChatCountsQuery.queryCounts — no Metadata store yet", () => {
  it("treats every chat as active and untagged when metadata.db is absent", () => {
    // No Metadata/Tag repository is created, so metadata.db never exists —
    // nothing has been trashed or tagged.
    const archive = createArchiveRepository({ dataDir });
    seedChat(archive, {
      sourceId: "c1",
      firstSeenAt: new Date(1),
      project: "alpha",
    });
    seedChat(archive, { sourceId: "c2", firstSeenAt: new Date(2) });

    const countsQuery = createChatCountsQuery({ dataDir });
    const main = countsQuery.queryCounts({ includeTrashed: false });

    expect(main.total).toBe(2);
    expect(main.untagged).toBe(2);
    expect(main.tags).toEqual([]);

    // Trash is empty with nothing trashed.
    const trash = countsQuery.queryCounts({ includeTrashed: true });
    expect(trash.total).toBe(0);

    countsQuery.close();
  });
});
