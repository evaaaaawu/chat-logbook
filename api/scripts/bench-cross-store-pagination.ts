import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createArchiveRepository } from "../src/archive/repository.js";
import { createTagRepository } from "../src/metadata/tags.js";
import { seedArchive } from "../src/seed/seed.js";
import {
  createAppLevelStrategy,
  createAttachStrategy,
  type PageCursor,
  type PageQuery,
  type PaginatedQueryStrategy,
} from "../src/spike/cross-store-pagination.js";

// Spike benchmark (issue #128). Seeds a large throwaway Archive once, then times
// the two cross-store paginated-query strategies — ATTACH vs app-level
// intersection — across representative query shapes and page depths. Run with:
//
//   pnpm --filter @chat-logbook/api exec tsx scripts/bench-cross-store-pagination.ts
//
// Reuses a cached seed dir so re-runs are fast; pass --reseed to rebuild it.

const COUNT = Number(process.env.BENCH_COUNT ?? 50_000);
const ITERATIONS = Number(process.env.BENCH_ITER ?? 50);
const PAGE = 50;
const SEED_DIR = path.join(os.tmpdir(), `chat-logbook-bench-${COUNT}`);

function ensureSeed(): void {
  const reseed = process.argv.includes("--reseed");
  const archiveFile = path.join(SEED_DIR, "archive.db");
  if (reseed) fs.rmSync(SEED_DIR, { recursive: true, force: true });
  if (fs.existsSync(archiveFile)) {
    console.log(`Reusing seeded dir ${SEED_DIR} (${COUNT} chats).`);
    return;
  }
  console.log(`Seeding ${COUNT} chats into ${SEED_DIR} ...`);
  const t0 = Date.now();
  const archive = createArchiveRepository({ dataDir: SEED_DIR });
  const tags = createTagRepository({ dataDir: SEED_DIR });
  const summary = seedArchive(
    { archive, tags },
    { count: COUNT, seed: 1, projects: 50, tagRatio: 0.3, tagPool: 10 }
  );
  archive.close();
  console.log(
    `Seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
      `${summary.chats} chats, ${summary.tags} tags, ` +
      `${summary.taggedChats} tagged.`
  );
}

/** The (first_seen_at, id) cursor sitting `offset` rows into the full order. */
function cursorAtOffset(offset: number): PageCursor {
  const db = new Database(path.join(SEED_DIR, "archive.db"), {
    readonly: true,
  });
  const row = db
    .prepare(
      `SELECT id, first_seen_at AS sortKey FROM chats
       ORDER BY first_seen_at DESC, id DESC LIMIT 1 OFFSET ?`
    )
    .get(offset) as { id: string; sortKey: number };
  db.close();
  return { sortKey: row.sortKey, id: row.id };
}

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function timeMs(strategy: PaginatedQueryStrategy, query: PageQuery): number {
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    strategy.listChatsPage(query);
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

function tagIds(): string[] {
  const tags = createTagRepository({ dataDir: SEED_DIR });
  return tags.listTags().map((t) => t.id);
}

function main(): void {
  ensureSeed();
  const tags = tagIds();
  const deepCursor = cursorAtOffset(COUNT - PAGE - 1);

  const cases: { name: string; query: PageQuery }[] = [
    { name: "unfiltered, first page", query: { limit: PAGE } },
    {
      name: "unfiltered, deep page",
      query: { limit: PAGE, cursor: deepCursor },
    },
    {
      name: "one Project (~1.7k rows)",
      query: { limit: PAGE, projects: ["Project 0"] },
    },
    {
      name: "Tag AND (two tags)",
      query: { limit: PAGE, tags: [tags[0], tags[1]] },
    },
    {
      name: "Untagged group",
      query: { limit: PAGE, tags: [""] },
    },
    {
      name: "Project + Tag combined",
      query: { limit: PAGE, projects: ["Project 0"], tags: [tags[0]] },
    },
  ];

  const attach = createAttachStrategy({ dataDir: SEED_DIR });
  const appLevel = createAppLevelStrategy({ dataDir: SEED_DIR });

  console.log(
    `\nMedian of ${ITERATIONS} runs, page size ${PAGE}, ${COUNT} chats:\n`
  );
  console.log(
    "query".padEnd(28) +
      "ATTACH (ms)".padStart(14) +
      "app-level (ms)".padStart(16) +
      "  ratio"
  );
  console.log("-".repeat(64));
  for (const c of cases) {
    const a = timeMs(attach, c.query);
    const b = timeMs(appLevel, c.query);
    const ratio = (b / a).toFixed(1);
    console.log(
      c.name.padEnd(28) +
        a.toFixed(2).padStart(14) +
        b.toFixed(2).padStart(16) +
        `  ${ratio}x`
    );
  }

  attach.close();
  appLevel.close();
}

main();
