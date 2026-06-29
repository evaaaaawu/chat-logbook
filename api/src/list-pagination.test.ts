import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createChatReader } from "./chat-reader.js";
import { createChatPageQuery } from "./list-pagination.js";
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-page-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function makeReader(
  archive: ReturnType<typeof createArchiveRepository>,
  metadata: ReturnType<typeof createMetadataRepository>,
  tags: ReturnType<typeof createTagRepository>
) {
  const pageQuery = createChatPageQuery({ dataDir });
  const reader = createChatReader({ archive, metadata, tags, pageQuery });
  return { reader, pageQuery };
}

describe("ChatReader.listChatsPage — keyset pagination", () => {
  it("returns the newest page by createdAt with a next cursor", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Three chats, ascending createdAt; newest-first the order is c3, c2, c1.
    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });
    seedChat(archive, { sourceId: "c2", firstSeenAt: new Date(2_000) });
    seedChat(archive, { sourceId: "c3", firstSeenAt: new Date(3_000) });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({ sort: "createdAt", limit: 2 });

    expect(page.chats.map((c) => c.sourceId)).toEqual(["c3", "c2"]);
    expect(page.nextCursor).not.toBeNull();

    pageQuery.close();
  });

  it("returns the oldest page by createdAt when direction is asc", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Same three chats; ascending the order is c1, c2, c3 (oldest first).
    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });
    seedChat(archive, { sourceId: "c2", firstSeenAt: new Date(2_000) });
    seedChat(archive, { sourceId: "c3", firstSeenAt: new Date(3_000) });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      direction: "asc",
      limit: 2,
    });

    expect(page.chats.map((c) => c.sourceId)).toEqual(["c1", "c2"]);
    expect(page.nextCursor).not.toBeNull();

    pageQuery.close();
  });

  it("walks cursors to reproduce the full order with no overlap or gaps", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    for (let i = 1; i <= 5; i++) {
      seedChat(archive, { sourceId: `c${i}`, firstSeenAt: new Date(i * 1000) });
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "createdAt",
        limit: 2,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.sourceId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    // Newest-first across every page, each chat exactly once.
    expect(seen).toEqual(["c5", "c4", "c3", "c2", "c1"]);

    pageQuery.close();
  });

  it("walks asc cursors to reproduce the full ascending order", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    for (let i = 1; i <= 5; i++) {
      seedChat(archive, { sourceId: `c${i}`, firstSeenAt: new Date(i * 1000) });
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "createdAt",
        direction: "asc",
        limit: 2,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.sourceId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    // Oldest-first across every page, each chat exactly once — the asc cursor is
    // strictly past the previous page with no overlap or gap.
    expect(seen).toEqual(["c1", "c2", "c3", "c4", "c5"]);

    pageQuery.close();
  });

  it("returns a null cursor when the page exactly drains the list", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });
    seedChat(archive, { sourceId: "c2", firstSeenAt: new Date(2_000) });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    // Exactly `limit` rows remain: the LIMIT+1 probe finds no extra row, so the
    // cursor is null even though the page is full.
    const page = reader.listChatsPage({ sort: "createdAt", limit: 2 });

    expect(page.chats.map((c) => c.sourceId)).toEqual(["c2", "c1"]);
    expect(page.nextCursor).toBeNull();

    pageQuery.close();
  });

  it("sorts by updatedAt (most recent activity), not createdAt", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // "old" was created first but has the most recent message; "new" was created
    // later but its last activity is older. createdAt order is [new, old];
    // updatedAt order flips to [old, new].
    seedChat(archive, { sourceId: "old", firstSeenAt: new Date(1_000) });
    seedChat(archive, { sourceId: "new", firstSeenAt: new Date(5_000) });
    seedMessage(archive, {
      sourceId: "old",
      messageId: "m-old",
      ts: new Date(9_000),
    });
    seedMessage(archive, {
      sourceId: "new",
      messageId: "m-new",
      ts: new Date(6_000),
    });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 10 })
        .chats.map((c) => c.sourceId)
    ).toEqual(["new", "old"]);
    expect(
      reader
        .listChatsPage({ sort: "updatedAt", limit: 10 })
        .chats.map((c) => c.sourceId)
    ).toEqual(["old", "new"]);

    pageQuery.close();
  });

  it("pages createdAt by displayed createdAt (min message ts), not first_seen_at", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // first_seen_at (ingest time) is always >= the messages it carries. Here the
    // two axes disagree: A is seen first but its earliest message is older, B is
    // seen later but its earliest message is newer. Displayed createdAt is
    // min(messages.ts), so newest-first the order is [B, A] — the reverse of
    // first_seen_at order [A, B]. Paging must follow the displayed value.
    seedChat(archive, { sourceId: "A", firstSeenAt: new Date(1_000) });
    seedChat(archive, { sourceId: "B", firstSeenAt: new Date(900) });
    seedMessage(archive, {
      sourceId: "A",
      messageId: "m-a",
      ts: new Date(100),
    });
    seedMessage(archive, {
      sourceId: "B",
      messageId: "m-b",
      ts: new Date(500),
    });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({ sort: "createdAt", limit: 10 });

    // The page order matches each chat's own displayed createdAt.
    const byCreatedAtDesc = [...page.chats].sort(
      (x, y) => y.createdAt - x.createdAt
    );
    expect(page.chats.map((c) => c.sourceId)).toEqual(
      byCreatedAtDesc.map((c) => c.sourceId)
    );
    expect(page.chats.map((c) => c.sourceId)).toEqual(["B", "A"]);

    pageQuery.close();
  });

  it("paginates across a run of equal sort keys with no drop or duplicate", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Four chats share one createdAt; only the id tiebreaker separates them.
    for (let i = 1; i <= 4; i++) {
      seedChat(archive, { sourceId: `c${i}`, firstSeenAt: new Date(1_000) });
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "createdAt",
        limit: 2,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.sourceId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    // Every chat exactly once across the tie boundary — no skip, no repeat.
    expect(seen).toHaveLength(4);
    expect(new Set(seen)).toEqual(new Set(["c1", "c2", "c3", "c4"]));

    pageQuery.close();
  });

  it("tie-breaks a run of equal sort keys by id in asc direction too", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Four chats share one createdAt; the asc cursor must tie-break by id
    // ascending so the run pages with no overlap or gap — the same stability the
    // desc path has, mirrored.
    for (let i = 1; i <= 4; i++) {
      seedChat(archive, { sourceId: `c${i}`, firstSeenAt: new Date(1_000) });
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "createdAt",
        direction: "asc",
        limit: 2,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.sourceId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    expect(seen).toHaveLength(4);
    expect(new Set(seen)).toEqual(new Set(["c1", "c2", "c3", "c4"]));

    pageQuery.close();
  });

  it("holds a deeper page when a newer chat is ingested after the cursor", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    for (let i = 1; i <= 4; i++) {
      seedChat(archive, { sourceId: `c${i}`, firstSeenAt: new Date(i * 1000) });
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    // Page 1 is [c4, c3]; its cursor bounds the next page to rows older than c3.
    const first = reader.listChatsPage({ sort: "createdAt", limit: 2 });
    expect(first.chats.map((c) => c.sourceId)).toEqual(["c4", "c3"]);
    const cursor = first.nextCursor ?? undefined;

    // A background refresh ingests a brand-new chat that sorts at the very top.
    seedChat(archive, { sourceId: "c5", firstSeenAt: new Date(5_000) });

    // The page query's long-lived connection sees the post-open write: a fresh
    // first page now leads with c5.
    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 2 })
        .chats.map((c) => c.sourceId)
    ).toEqual(["c5", "c4"]);

    // The deeper window holds: the cursor still yields [c2, c1], unaffected by
    // the insert above it.
    const second = reader.listChatsPage({
      sort: "createdAt",
      limit: 2,
      cursor,
    });
    expect(second.chats.map((c) => c.sourceId)).toEqual(["c2", "c1"]);

    pageQuery.close();
  });

  it("excludes trashed chats from a page, unless includeTrashed is set", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });
    const c2 = seedChat(archive, {
      sourceId: "c2",
      firstSeenAt: new Date(2_000),
    });
    seedChat(archive, { sourceId: "c3", firstSeenAt: new Date(3_000) });
    metadata.softDelete(c2);

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    // Active-list page skips the trashed c2 entirely.
    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 10 })
        .chats.map((c) => c.sourceId)
    ).toEqual(["c3", "c1"]);

    // The Trash path opts back in.
    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 10, includeTrashed: true })
        .chats.map((c) => c.sourceId)
    ).toEqual(["c3", "c2", "c1"]);

    pageQuery.close();
  });

  it("hydrates each page row with the full public Chat shape", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const internalId = seedChat(archive, {
      sourceId: "c1",
      firstSeenAt: new Date(2_000),
      project: "proj-a",
    });
    // First user message ts == first_seen_at so the derived createdAt and the
    // keyset sort key coincide.
    seedMessage(archive, {
      sourceId: "c1",
      messageId: "m1",
      ts: new Date(2_000),
      role: "user",
    });
    const tag = tags.createTag("urgent", "violet");
    tags.assignTag(internalId, tag.id);

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({ sort: "createdAt", limit: 10 });

    expect(page.chats).toHaveLength(1);
    const chat = page.chats[0];
    expect(chat.sourceId).toBe("c1");
    expect(chat.title).toBe("hi");
    expect(chat.project).toBe("proj-a");
    expect(chat.tags.map((t) => t.name)).toEqual(["urgent"]);
    expect(chat.createdAt).toBe(2_000);
    expect(chat.updatedAt).toBe(2_000);
    expect(chat.id).toMatch(/^clog_/);

    pageQuery.close();
  });
});
