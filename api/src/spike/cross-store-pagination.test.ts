import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "../archive/repository.js";
import { createTagRepository } from "../metadata/tags.js";
import { TAG_COLORS } from "../metadata/tag-colors.js";
import { seedArchive } from "../seed/seed.js";
import type { PageQuery } from "./cross-store-pagination.js";
import {
  createAppLevelStrategy,
  createAttachStrategy,
  type PageCursor,
  type PaginatedQueryStrategy,
} from "./cross-store-pagination.js";

const AGENT = "claude-code";

let dataDir: string;
const open: PaginatedQueryStrategy[] = [];

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-spike-"));
});

afterEach(() => {
  for (const s of open.splice(0)) s.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Seed a chat through the real write seam; returns the internal id. */
function seedChat(opts: {
  sourceId: string;
  firstSeenAtMs: number;
  project?: string | null;
}): string {
  const archive = createArchiveRepository({ dataDir });
  const id = archive.ensureChat(
    AGENT,
    opts.sourceId,
    new Date(opts.firstSeenAtMs),
    opts.project ?? undefined
  );
  archive.close();
  return id;
}

/** Create a Tag; returns its id. */
function seedTag(name: string, colorIndex = 0): string {
  const tags = createTagRepository({ dataDir });
  return tags.createTag(name, TAG_COLORS[colorIndex]).id;
}

/** Assign Tags to a Chat by internal id. */
function assignTags(chatInternalId: string, tagIds: string[]): void {
  const tags = createTagRepository({ dataDir });
  for (const tagId of tagIds) tags.assignTag(chatInternalId, tagId);
}

describe("cross-store paginated query — app-level strategy", () => {
  it("returns the newest page first, capped at limit, with a nextCursor", () => {
    const c300 = seedChat({ sourceId: "s-300", firstSeenAtMs: 300 });
    const c200 = seedChat({ sourceId: "s-200", firstSeenAtMs: 200 });
    seedChat({ sourceId: "s-100", firstSeenAtMs: 100 });

    const strategy = createAppLevelStrategy({ dataDir });
    open.push(strategy);

    const page = strategy.listChatsPage({ limit: 2 });

    expect(page.items.map((i) => i.id)).toEqual([c300, c200]);
    expect(page.items.map((i) => i.sortKey)).toEqual([300, 200]);
    expect(page.nextCursor).toEqual({ sortKey: 200, id: c200 });
  });

  it("walks every chat across pages via the cursor — no overlap, no gap", () => {
    const ids = [500, 400, 300, 200, 100].map((ms) =>
      seedChat({ sourceId: `s-${ms}`, firstSeenAtMs: ms })
    );

    const strategy = createAppLevelStrategy({ dataDir });
    open.push(strategy);

    const seen: string[] = [];
    let cursor: PageCursor | undefined;
    let pages = 0;
    do {
      const page = strategy.listChatsPage({ limit: 2, cursor });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);

    // 5 chats at limit 2 → pages of 2, 2, 1; the last page has no nextCursor.
    expect(pages).toBe(3);
    expect(seen).toEqual(ids); // newest-first, every id exactly once
  });

  it("filters by Project (OR), with '' selecting the (No project) group", () => {
    const a = seedChat({ sourceId: "a", firstSeenAtMs: 400, project: "Alpha" });
    const b = seedChat({ sourceId: "b", firstSeenAtMs: 300, project: "Beta" });
    seedChat({ sourceId: "g", firstSeenAtMs: 200, project: "Gamma" });
    const none = seedChat({ sourceId: "n", firstSeenAtMs: 100, project: null });

    const strategy = createAppLevelStrategy({ dataDir });
    open.push(strategy);

    const named = strategy.listChatsPage({
      limit: 10,
      projects: ["Alpha", "Beta"],
    });
    expect(named.items.map((i) => i.id)).toEqual([a, b]);

    const withNoProject = strategy.listChatsPage({
      limit: 10,
      projects: ["Alpha", ""],
    });
    expect(withNoProject.items.map((i) => i.id)).toEqual([a, none]);
  });

  it("filters by Tag (AND), with '' selecting the Untagged group", () => {
    const both = seedChat({ sourceId: "both", firstSeenAtMs: 400 });
    const xOnly = seedChat({ sourceId: "x", firstSeenAtMs: 300 });
    const yBare = seedChat({ sourceId: "y", firstSeenAtMs: 200 });
    const bare = seedChat({ sourceId: "bare", firstSeenAtMs: 100 });

    const tagX = seedTag("X", 0);
    const tagY = seedTag("Y", 1);
    assignTags(both, [tagX, tagY]);
    assignTags(xOnly, [tagX]);
    // `bare` holds no Tags.

    const strategy = createAppLevelStrategy({ dataDir });
    open.push(strategy);

    // AND within: only a Chat holding both X and Y passes.
    const andBoth = strategy.listChatsPage({ limit: 10, tags: [tagX, tagY] });
    expect(andBoth.items.map((i) => i.id)).toEqual([both]);

    // '' selects the Untagged group (holds no Tag at all): both y and bare.
    const untagged = strategy.listChatsPage({ limit: 10, tags: [""] });
    expect(untagged.items.map((i) => i.id)).toEqual([yBare, bare]);

    // Mixing a real Tag with '' ANDs to nothing (can't hold X yet be untagged).
    const contradiction = strategy.listChatsPage({
      limit: 10,
      tags: [tagX, ""],
    });
    expect(contradiction.items).toEqual([]);
  });

  it("ANDs Project and Tag filters across types", () => {
    const tag = seedTag("Pinned", 0);
    const alphaPinned = seedChat({
      sourceId: "ap",
      firstSeenAtMs: 400,
      project: "Alpha",
    });
    seedChat({ sourceId: "au", firstSeenAtMs: 300, project: "Alpha" }); // Alpha, no tag
    const betaPinned = seedChat({
      sourceId: "bp",
      firstSeenAtMs: 200,
      project: "Beta",
    });
    assignTags(alphaPinned, [tag]);
    assignTags(betaPinned, [tag]);

    const strategy = createAppLevelStrategy({ dataDir });
    open.push(strategy);

    // In Project Alpha (OR) AND holding Tag Pinned (AND) → only alphaPinned.
    const page = strategy.listChatsPage({
      limit: 10,
      projects: ["Alpha"],
      tags: [tag],
    });
    expect(page.items.map((i) => i.id)).toEqual([alphaPinned]);
  });
});

describe("cross-store paginated query — ATTACH strategy", () => {
  it("runs a combined Project + Tag query in one cross-database pass", () => {
    const tag = seedTag("Pinned", 0);
    const alphaPinned = seedChat({
      sourceId: "ap",
      firstSeenAtMs: 400,
      project: "Alpha",
    });
    const alphaPinned2 = seedChat({
      sourceId: "ap2",
      firstSeenAtMs: 350,
      project: "Alpha",
    });
    seedChat({ sourceId: "au", firstSeenAtMs: 300, project: "Alpha" }); // no tag
    const betaPinned = seedChat({
      sourceId: "bp",
      firstSeenAtMs: 200,
      project: "Beta",
    });
    assignTags(alphaPinned, [tag]);
    assignTags(alphaPinned2, [tag]);
    assignTags(betaPinned, [tag]);

    const strategy = createAttachStrategy({ dataDir });
    open.push(strategy);

    // First page: Alpha ∧ Pinned, newest first, limit 1 → alphaPinned + cursor.
    const first = strategy.listChatsPage({
      limit: 1,
      projects: ["Alpha"],
      tags: [tag],
    });
    expect(first.items.map((i) => i.id)).toEqual([alphaPinned]);
    expect(first.nextCursor).toEqual({ sortKey: 400, id: alphaPinned });

    // Next page via the cursor → alphaPinned2, then no more.
    const second = strategy.listChatsPage({
      limit: 1,
      projects: ["Alpha"],
      tags: [tag],
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((i) => i.id)).toEqual([alphaPinned2]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("cross-store paginated query — strategy equivalence", () => {
  /** Page through the whole result set, collecting the id sequence. */
  function walkAll(
    strategy: PaginatedQueryStrategy,
    base: Omit<PageQuery, "cursor">
  ): string[] {
    const ids: string[] = [];
    let cursor: PageCursor | undefined;
    do {
      const page = strategy.listChatsPage({ ...base, cursor });
      ids.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  }

  it("ATTACH and app-level return identical pages for every query shape", () => {
    const archive = createArchiveRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    seedArchive(
      { archive, tags },
      { count: 80, seed: 7, projects: 4, tagRatio: 0.5, tagPool: 4 }
    );
    const tagIds = tags.listTags().map((t) => t.id);
    archive.close();

    const attach = createAttachStrategy({ dataDir });
    const appLevel = createAppLevelStrategy({ dataDir });
    open.push(attach, appLevel);

    const queries: Omit<PageQuery, "cursor">[] = [
      { limit: 7 }, // unfiltered
      { limit: 7, projects: ["Project 0", "Project 2"] }, // project OR
      { limit: 7, projects: [""] }, // (No project) group
      { limit: 7, tags: [tagIds[0]] }, // single tag
      { limit: 7, tags: [tagIds[0], tagIds[1]] }, // tag AND
      { limit: 7, tags: [""] }, // Untagged group
      { limit: 7, projects: ["Project 1"], tags: [tagIds[2]] }, // combined
      { limit: 1, tags: [tagIds[3]] }, // tiny pages
      { limit: 1000, projects: ["Project 0"] }, // single big page
    ];

    for (const q of queries) {
      const fromAttach = walkAll(attach, q);
      const fromApp = walkAll(appLevel, q);
      expect(fromApp, JSON.stringify(q)).toEqual(fromAttach);
    }
  });
});
