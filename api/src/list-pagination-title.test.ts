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
import { reconcileTitleSortKeys } from "./metadata/reconcile-title-sort-keys.js";

const AGENT = "claude-code";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-title-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Seed a chat whose title is its first user message text (one line), at the
// given createdAt. No message means the title derives to "Untitled".
function seedTitled(
  archive: ReturnType<typeof createArchiveRepository>,
  sourceId: string,
  title: string | null,
  createdAt: Date
): string {
  const id = archive.ensureChat(AGENT, sourceId, createdAt);
  if (title !== null) {
    const raw = archive.insertRawMessage({
      agent: AGENT,
      sourceId,
      sourcePath: "/dev/null",
      sourceLocator: `${sourceId}:0`,
      payload: { text: title },
      ingestedAt: createdAt,
    });
    archive.upsertNormalizedMessage({
      agent: AGENT,
      sourceId,
      rawId: raw.id,
      message: {
        messageId: `${sourceId}-m`,
        role: "user",
        ts: createdAt.toISOString(),
        text: title,
        blocks: [{ type: "text", text: title }],
      },
    });
  }
  return id;
}

function makeReader(
  archive: ReturnType<typeof createArchiveRepository>,
  metadata: ReturnType<typeof createMetadataRepository>,
  tags: ReturnType<typeof createTagRepository>
) {
  reconcileTitleSortKeys({ archive, metadata });
  const pageQuery = createChatPageQuery({ dataDir });
  const reader = createChatReader({ archive, metadata, tags, pageQuery });
  return { reader, pageQuery };
}

describe("ChatReader.listChatsPage — Title axis (#146)", () => {
  it("orders a page A-Z by title (asc)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedTitled(archive, "c1", "Banana", new Date(1_000));
    seedTitled(archive, "c2", "apple", new Date(2_000));
    seedTitled(archive, "c3", "Cherry", new Date(3_000));

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "title",
      direction: "asc",
      limit: 10,
    });

    // Case-insensitive A-Z: apple, Banana, Cherry.
    expect(page.chats.map((c) => c.title)).toEqual([
      "apple",
      "Banana",
      "Cherry",
    ]);

    pageQuery.close();
  });

  it("orders a page Z-A by title (desc)", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedTitled(archive, "c1", "Banana", new Date(1_000));
    seedTitled(archive, "c2", "apple", new Date(2_000));
    seedTitled(archive, "c3", "Cherry", new Date(3_000));

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "title",
      direction: "desc",
      limit: 10,
    });

    expect(page.chats.map((c) => c.title)).toEqual([
      "Cherry",
      "Banana",
      "apple",
    ]);

    pageQuery.close();
  });

  it("sorts Untitled as the ordinary string 'untitled' (ADR-0019), near the bottom in asc", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    seedTitled(archive, "c1", "Apple", new Date(1_000));
    seedTitled(archive, "c2", null, new Date(2_000)); // -> "Untitled"
    seedTitled(archive, "c3", "Zebra", new Date(3_000));

    const { reader, pageQuery } = makeReader(archive, metadata, tags);
    const page = reader.listChatsPage({
      sort: "title",
      direction: "asc",
      limit: 10,
    });

    // "Untitled" keys as the letter U: after Apple/Zebra? No — U < Z, so it sits
    // between them: Apple, Untitled, Zebra. It is NOT a bidirectional sink.
    expect(page.chats.map((c) => c.title)).toEqual([
      "Apple",
      "Untitled",
      "Zebra",
    ]);

    pageQuery.close();
  });

  it("walks title cursors to reproduce the full A-Z order with no overlap or gap", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const titles = ["delta", "alpha", "echo", "bravo", "charlie"];
    titles.forEach((t, i) =>
      seedTitled(archive, `c${i}`, t, new Date((i + 1) * 1000))
    );

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "title",
        direction: "asc",
        limit: 2,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.title));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    expect(seen).toEqual(["alpha", "bravo", "charlie", "delta", "echo"]);

    pageQuery.close();
  });

  it("pages a run of equal titles by id tiebreak with no drop or duplicate", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    // Four chats share the identical title; only the id tiebreak separates them,
    // so the string-keyed cursor must carry it to page the run cleanly.
    const ids = [0, 1, 2, 3].map((i) =>
      seedTitled(archive, `c${i}`, "Same Title", new Date((i + 1) * 1000))
    );

    const { reader, pageQuery } = makeReader(archive, metadata, tags);

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = reader.listChatsPage({
        sort: "title",
        direction: "asc",
        limit: 2,
        cursor,
      });
      seen.push(...page.chats.map((c) => c.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 10);

    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    void ids;

    pageQuery.close();
  });

  it("orders by the custom title when one overrides the first-user-text", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    const a = seedTitled(archive, "a", "Apple", new Date(1_000));
    seedTitled(archive, "b", "Mango", new Date(2_000));
    seedTitled(archive, "z", "Zebra", new Date(3_000));
    reconcileTitleSortKeys({ archive, metadata });
    // Rename "Apple" to "Quokka": its sort position moves accordingly.
    metadata.setCustomTitle(a, "Quokka");

    const pageQuery = createChatPageQuery({ dataDir });
    const reader = createChatReader({ archive, metadata, tags, pageQuery });
    const page = reader.listChatsPage({
      sort: "title",
      direction: "asc",
      limit: 10,
    });

    // Sorted by effective title: Mango, Quokka (was Apple), Zebra.
    expect(page.chats.map((c) => c.title)).toEqual([
      "Mango",
      "Quokka",
      "Zebra",
    ]);

    pageQuery.close();
  });

  it("orders the title page through the covering index, not a full scan + sort", () => {
    const archive = createArchiveRepository({ dataDir });
    const metadata = createMetadataRepository({ dataDir });
    const tags = createTagRepository({ dataDir });

    for (let i = 1; i <= 50; i++) {
      seedTitled(archive, `c${i}`, `Title ${i}`, new Date(i * 1000));
    }
    reconcileTitleSortKeys({ archive, metadata });
    void tags;

    const db = new Database(path.join(dataDir, "archive.db"), {
      readonly: true,
    });
    db.prepare("ATTACH DATABASE ? AS meta").run(
      path.join(dataDir, "metadata.db")
    );
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT c.id AS id, k.sort_key AS sortKey
         FROM chats c JOIN meta.chat_sort_keys k ON k.id = c.id
         ORDER BY k.sort_key ASC, k.id ASC
         LIMIT 10`
      )
      .all() as { detail: string }[];
    db.close();

    const detail = plan.map((p) => p.detail).join("\n");
    // The title order is served by the covering keyset index...
    expect(detail).toContain("chat_sort_keys_sort_key_idx");
    // ...so there is no temp B-tree sorting the whole list.
    expect(detail).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/i);
  });
});
