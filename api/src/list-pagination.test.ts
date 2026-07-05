import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
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

// Soft-delete a chat and pin its deleted_at to a known instant. `softDelete`
// stamps deleted_at with the wall clock, which collides at ms resolution across
// rapid calls; the Trash sort tests need deterministic, distinct deleted times,
// so we overwrite the column directly through a short-lived writable connection.
function trashChat(
  metadata: ReturnType<typeof createMetadataRepository>,
  internalId: string,
  deletedAt: Date
): void {
  metadata.softDelete(internalId);
  const db = new Database(path.join(dataDir, "metadata.db"));
  db.prepare("UPDATE chats_meta SET deleted_at = ? WHERE id = ?").run(
    deletedAt.getTime(),
    internalId
  );
  db.close();
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

describe("ChatReader.listChatsPage — server-side filtering (#130)", () => {
  it("filters a page to chats in any of the selected Projects (OR)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, {
      sourceId: "a1",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    seedChat(archive, {
      sourceId: "b1",
      firstSeenAt: new Date(2_000),
      project: "beta",
    });
    seedChat(archive, {
      sourceId: "g1",
      firstSeenAt: new Date(3_000),
      project: "gamma",
    });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      limit: 10,
      projects: ["alpha", "gamma"],
    });

    // Newest-first within the selected Projects; beta is excluded.
    expect(page.chats.map((c) => c.sourceId)).toEqual(["g1", "a1"]);

    pageQuery.close();
  });

  it("selects the (No project) group with an empty-string entry", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // null and "" both belong to the (No project) bucket; "alpha" does not.
    seedChat(archive, {
      sourceId: "none1",
      firstSeenAt: new Date(1_000),
      project: null,
    });
    seedChat(archive, {
      sourceId: "empty1",
      firstSeenAt: new Date(2_000),
      project: "",
    });
    seedChat(archive, {
      sourceId: "a1",
      firstSeenAt: new Date(3_000),
      project: "alpha",
    });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      limit: 10,
      projects: [""],
    });

    expect(page.chats.map((c) => c.sourceId)).toEqual(["empty1", "none1"]);

    pageQuery.close();
  });

  it("filters a page to chats holding every selected Tag (AND)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const both = seedChat(archive, {
      sourceId: "both",
      firstSeenAt: new Date(1_000),
    });
    const onlyX = seedChat(archive, {
      sourceId: "onlyX",
      firstSeenAt: new Date(2_000),
    });
    seedChat(archive, { sourceId: "onlyY", firstSeenAt: new Date(3_000) });

    const x = tags.createTag("x", "violet");
    const y = tags.createTag("y", "blue");
    tags.assignTag(both, x.id);
    tags.assignTag(both, y.id);
    tags.assignTag(onlyX, x.id);
    // onlyY (sourceId) holds neither in this seed — only "both" has both Tags.

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      limit: 10,
      tags: [x.id, y.id],
    });

    // Only the chat holding BOTH selected Tags passes the AND filter.
    expect(page.chats.map((c) => c.sourceId)).toEqual(["both"]);

    pageQuery.close();
  });

  it("selects the Untagged group with '', and yields nothing when '' is mixed with a real Tag", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, { sourceId: "bare", firstSeenAt: new Date(1_000) });
    const tagged = seedChat(archive, {
      sourceId: "tagged",
      firstSeenAt: new Date(2_000),
    });
    const x = tags.createTag("x", "violet");
    tags.assignTag(tagged, x.id);

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    // '' alone keeps only the zero-Tag chat.
    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 10, tags: [""] })
        .chats.map((c) => c.sourceId)
    ).toEqual(["bare"]);

    // A real Tag AND '' (holds the Tag AND holds zero Tags) is unsatisfiable.
    expect(
      reader.listChatsPage({ sort: "createdAt", limit: 10, tags: [x.id, ""] })
        .chats
    ).toEqual([]);

    pageQuery.close();
  });

  it("unions the selected Tags when tagMode is 'any'", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const both = seedChat(archive, {
      sourceId: "both",
      firstSeenAt: new Date(1_000),
    });
    const onlyX = seedChat(archive, {
      sourceId: "onlyX",
      firstSeenAt: new Date(2_000),
    });
    seedChat(archive, { sourceId: "none", firstSeenAt: new Date(3_000) });

    const x = tags.createTag("x", "violet");
    const y = tags.createTag("y", "blue");
    tags.assignTag(both, x.id);
    tags.assignTag(both, y.id);
    tags.assignTag(onlyX, x.id);

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      limit: 10,
      tags: [x.id, y.id],
      tagMode: "any",
    });

    // Any: every chat holding at least one of x/y — "onlyX" and "both"
    // (newest-first by createdAt), not the untagged "none".
    expect(page.chats.map((c) => c.sourceId)).toEqual(["onlyX", "both"]);

    pageQuery.close();
  });

  it("ORs the Untagged group into the union in 'any' mode", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const tagged = seedChat(archive, {
      sourceId: "tagged",
      firstSeenAt: new Date(1_000),
    });
    seedChat(archive, { sourceId: "other", firstSeenAt: new Date(2_000) });
    seedChat(archive, { sourceId: "bare", firstSeenAt: new Date(3_000) });

    const x = tags.createTag("x", "violet");
    const other = tags.createTag("other", "blue");
    tags.assignTag(tagged, x.id);
    // "other" (sourceId) holds a different Tag; "bare" holds none.
    const otherId = archive.ensureChat("claude-code", "other", new Date(2_000));
    tags.assignTag(otherId, other.id);

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      limit: 10,
      tags: [x.id, ""],
      tagMode: "any",
    });

    // Any + Untagged: "holds x OR holds no Tags" — bare (3000) then tagged
    // (1000), newest-first; the differently-tagged "other" is excluded.
    expect(page.chats.map((c) => c.sourceId)).toEqual(["bare", "tagged"]);

    pageQuery.close();
  });

  it("ANDs the Project and Tag filters across types", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // alpha+x is the only chat satisfying both the Project and the Tag filter.
    const alphaX = seedChat(archive, {
      sourceId: "alphaX",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    const alphaNoTag = seedChat(archive, {
      sourceId: "alphaNoTag",
      firstSeenAt: new Date(2_000),
      project: "alpha",
    });
    const betaX = seedChat(archive, {
      sourceId: "betaX",
      firstSeenAt: new Date(3_000),
      project: "beta",
    });
    const x = tags.createTag("x", "violet");
    tags.assignTag(alphaX, x.id);
    tags.assignTag(betaX, x.id);
    void alphaNoTag;

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      limit: 10,
      projects: ["alpha"],
      tags: [x.id],
    });

    // betaX has the Tag but the wrong Project; alphaNoTag has the Project but no
    // Tag — only alphaX clears both.
    expect(page.chats.map((c) => c.sourceId)).toEqual(["alphaX"]);

    pageQuery.close();
  });

  it("walks filtered keyset pages with no overlap or gap", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Five alpha chats interleaved with beta chats by createdAt. The filter must
    // page only the alpha set, in full newest-first order, across the cursor.
    for (let i = 1; i <= 5; i++) {
      seedChat(archive, {
        sourceId: `a${i}`,
        firstSeenAt: new Date(i * 2000),
        project: "alpha",
      });
      seedChat(archive, {
        sourceId: `b${i}`,
        firstSeenAt: new Date(i * 2000 + 1000),
        project: "beta",
      });
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "createdAt",
        limit: 2,
        projects: ["alpha"],
        cursor,
      });
      seen.push(...page.chats.map((c) => c.sourceId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    // Only alpha chats, newest-first, each exactly once — the cursor stays
    // strictly past the previous filtered page.
    expect(seen).toEqual(["a5", "a4", "a3", "a2", "a1"]);

    pageQuery.close();
  });

  it("composes a filter with the asc direction", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, {
      sourceId: "a1",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    seedChat(archive, {
      sourceId: "b1",
      firstSeenAt: new Date(2_000),
      project: "beta",
    });
    seedChat(archive, {
      sourceId: "a2",
      firstSeenAt: new Date(3_000),
      project: "alpha",
    });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      direction: "asc",
      limit: 10,
      projects: ["alpha"],
    });

    // Oldest-first within the filtered set; beta excluded.
    expect(page.chats.map((c) => c.sourceId)).toEqual(["a1", "a2"]);

    pageQuery.close();
  });

  it("composes a filter with the Trash view (includeTrashed)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, {
      sourceId: "active",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    const trashed = seedChat(archive, {
      sourceId: "trashed",
      firstSeenAt: new Date(2_000),
      project: "alpha",
    });
    seedChat(archive, {
      sourceId: "betaTrashed",
      firstSeenAt: new Date(3_000),
      project: "beta",
    });
    metadata.softDelete(trashed);

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    // Main view: the trashed alpha chat is excluded, leaving only the active one.
    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 10, projects: ["alpha"] })
        .chats.map((c) => c.sourceId)
    ).toEqual(["active"]);

    // includeTrashed opts trashed chats back in (active + trashed, the existing
    // page-query contract), but the Project filter still applies: both alpha
    // chats show, the beta chat never does.
    expect(
      reader
        .listChatsPage({
          sort: "createdAt",
          limit: 10,
          projects: ["alpha"],
          includeTrashed: true,
        })
        .chats.map((c) => c.sourceId)
    ).toEqual(["trashed", "active"]);

    pageQuery.close();
  });

  it("treats an empty filter selection as unfiltered (clear-all)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, {
      sourceId: "a1",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    seedChat(archive, {
      sourceId: "b1",
      firstSeenAt: new Date(2_000),
      project: "beta",
    });

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    // Empty arrays mean "no filter" — every chat shows, exactly as omitting them.
    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 10, projects: [], tags: [] })
        .chats.map((c) => c.sourceId)
    ).toEqual(["b1", "a1"]);

    pageQuery.close();
  });
});

describe("ChatReader.listChatsPage — Trash view (#145)", () => {
  it("returns only trashed chats when trashedOnly is set", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });
    const c2 = seedChat(archive, {
      sourceId: "c2",
      firstSeenAt: new Date(2_000),
    });
    seedChat(archive, { sourceId: "c3", firstSeenAt: new Date(3_000) });
    trashChat(metadata, c2, new Date(9_000));

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    // The Trash view is trashed-only: active c1/c3 never appear, only the
    // soft-deleted c2 — unlike includeTrashed, which returns active + trashed.
    expect(
      reader
        .listChatsPage({ sort: "createdAt", limit: 10, trashedOnly: true })
        .chats.map((c) => c.sourceId)
    ).toEqual(["c2"]);

    pageQuery.close();
  });

  it("sorts the Trash view by deleted time, most-recently-deleted first", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Created in one order, trashed in another: the deletedAt axis follows the
    // trash time, independent of createdAt.
    const c1 = seedChat(archive, {
      sourceId: "c1",
      firstSeenAt: new Date(1_000),
    });
    const c2 = seedChat(archive, {
      sourceId: "c2",
      firstSeenAt: new Date(2_000),
    });
    const c3 = seedChat(archive, {
      sourceId: "c3",
      firstSeenAt: new Date(3_000),
    });
    trashChat(metadata, c1, new Date(30_000)); // deleted last
    trashChat(metadata, c2, new Date(10_000)); // deleted first
    trashChat(metadata, c3, new Date(20_000)); // deleted in the middle

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    // Most-recently-deleted first: c1 (30k), c3 (20k), c2 (10k).
    expect(
      reader
        .listChatsPage({ sort: "deletedAt", limit: 10, trashedOnly: true })
        .chats.map((c) => c.sourceId)
    ).toEqual(["c1", "c3", "c2"]);

    pageQuery.close();
  });

  it("walks deletedAt cursors to reproduce the full trash order with no gap or overlap", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Five trashed chats with distinct deleted times; newest-deleted first the
    // order is c5, c4, c3, c2, c1.
    for (let i = 1; i <= 5; i++) {
      const id = seedChat(archive, {
        sourceId: `c${i}`,
        firstSeenAt: new Date(i * 1000),
      });
      trashChat(metadata, id, new Date(i * 10_000));
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "deletedAt",
        limit: 2,
        trashedOnly: true,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.sourceId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    // Most-recently-deleted first across every page, each chat exactly once —
    // the cursor stays strictly past the previous page's last deleted_at.
    expect(seen).toEqual(["c5", "c4", "c3", "c2", "c1"]);

    pageQuery.close();
  });

  it("paginates a run of equal deleted times by id tiebreak with no drop or duplicate", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Four trashed chats share one deleted_at; only the id tiebreak separates
    // them, so the cursor must carry it to page the run cleanly.
    for (let i = 1; i <= 4; i++) {
      const id = seedChat(archive, {
        sourceId: `c${i}`,
        firstSeenAt: new Date(i * 1000),
      });
      trashChat(metadata, id, new Date(10_000));
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "deletedAt",
        limit: 2,
        trashedOnly: true,
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

  it("walks deletedAt asc cursors oldest-deleted first across pages", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    for (let i = 1; i <= 5; i++) {
      const id = seedChat(archive, {
        sourceId: `c${i}`,
        firstSeenAt: new Date(i * 1000),
      });
      trashChat(metadata, id, new Date(i * 10_000));
    }

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "deletedAt",
        direction: "asc",
        limit: 2,
        trashedOnly: true,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.sourceId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    // Oldest-deleted first across every page — the asc cursor mirrors the desc
    // stability, flipping both the comparison and the order.
    expect(seen).toEqual(["c1", "c2", "c3", "c4", "c5"]);

    pageQuery.close();
  });

  it("orders the Trash view by a time axis independently of deleted time", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // createdAt order is [b, a]; deleted_at order is the reverse [a, b]. Sorting
    // the trash-only page by createdAt must follow createdAt, not the trash time.
    const a = seedChat(archive, {
      sourceId: "a",
      firstSeenAt: new Date(1_000),
    });
    const b = seedChat(archive, {
      sourceId: "b",
      firstSeenAt: new Date(2_000),
    });
    seedChat(archive, { sourceId: "active", firstSeenAt: new Date(3_000) });
    trashChat(metadata, a, new Date(20_000));
    trashChat(metadata, b, new Date(10_000));

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "createdAt",
      limit: 10,
      trashedOnly: true,
    });

    // Newest createdAt first within trash; the active chat is excluded.
    expect(page.chats.map((c) => c.sourceId)).toEqual(["b", "a"]);

    pageQuery.close();
  });

  it("composes a Project filter with the trashed-only scope", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const alphaTrashed = seedChat(archive, {
      sourceId: "alphaTrashed",
      firstSeenAt: new Date(1_000),
      project: "alpha",
    });
    const betaTrashed = seedChat(archive, {
      sourceId: "betaTrashed",
      firstSeenAt: new Date(2_000),
      project: "beta",
    });
    seedChat(archive, {
      sourceId: "alphaActive",
      firstSeenAt: new Date(3_000),
      project: "alpha",
    });
    trashChat(metadata, alphaTrashed, new Date(10_000));
    trashChat(metadata, betaTrashed, new Date(20_000));

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "deletedAt",
      limit: 10,
      trashedOnly: true,
      projects: ["alpha"],
    });

    // Trash + Project filter: the trashed alpha chat shows; the trashed beta
    // chat (wrong Project) and the active alpha chat (not trashed) do not.
    expect(page.chats.map((c) => c.sourceId)).toEqual(["alphaTrashed"]);

    pageQuery.close();
  });

  it("returns an empty deletedAt page when there is no Metadata store", () => {
    const archive = createArchiveRepository({ dataDir });
    seedChat(archive, { sourceId: "c1", firstSeenAt: new Date(1_000) });

    // No metadata repo is created, so metadata.db is absent: a deleted-time read
    // has no trashed chats to return, rather than throwing on the missing join.
    const pageQuery = createChatPageQuery({ dataDir });
    const page = pageQuery.queryPage({
      sort: "deletedAt",
      limit: 10,
      trashedOnly: true,
    });

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();

    pageQuery.close();
  });

  it("hydrates a deletedAt page row with its deleted time and trashed flag", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const id = seedChat(archive, {
      sourceId: "c1",
      firstSeenAt: new Date(1_000),
    });
    trashChat(metadata, id, new Date(42_000));

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "deletedAt",
      limit: 10,
      trashedOnly: true,
    });

    expect(page.chats).toHaveLength(1);
    const chat = page.chats[0];
    expect(chat.sourceId).toBe("c1");
    expect(chat.deletedAt).toBe(42_000);
    expect(chat.isDeleted).toBe(true);

    pageQuery.close();
  });

  it("orders the deletedAt page through the covering index, not a full scan + sort", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    for (let i = 1; i <= 50; i++) {
      const id = seedChat(archive, {
        sourceId: `c${i}`,
        firstSeenAt: new Date(i * 1000),
      });
      trashChat(metadata, id, new Date(i * 10_000));
    }
    void tags;

    // Inspect how SQLite plans the deleted-time page. AC #2 (ADR-0017): the
    // ordering must be an index range scan over the deleted-time axis, never a
    // materialize-the-whole-trash-then-sort pass.
    const db = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    db.prepare("ATTACH DATABASE ? AS meta").run(
      path.join(dataDir, "metadata.db")
    );
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT c.id AS id, m.deleted_at AS sortKey
         FROM chats c JOIN meta.chats_meta m ON m.id = c.id
         WHERE m.deleted_at IS NOT NULL
         ORDER BY m.deleted_at DESC, m.id DESC
         LIMIT 10`
      )
      .all() as { detail: string }[];
    db.close();

    const detail = plan.map((p) => p.detail).join("\n");
    // The deleted-time order is served by the keyset index...
    expect(detail).toContain("chats_meta_deleted_at_idx");
    // ...so there is no temp B-tree sorting the whole trash set.
    expect(detail).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/i);
  });
});
