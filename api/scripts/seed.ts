import os from "node:os";
import { resolveDataDir } from "../src/config/data-dir.js";
import { assertSeedDataDirSafe } from "../src/seed/guard.js";
import { createArchiveRepository } from "../src/archive/repository.js";
import { createTagRepository } from "../src/metadata/tags.js";
import { seedArchive } from "../src/seed/seed.js";
import { DEFAULT_SEED_CONFIG, type SeedConfig } from "../src/seed/generator.js";

// Developer-only seed script. Fills a throwaway dev Archive with N synthetic
// Chats (default ~50,000) so the list-pipeline refactor can be validated at the
// tens-of-thousands scale this milestone targets. Targets the directory
// resolved from CHAT_LOGBOOK_DATA_DIR and refuses to touch the real archive.
//
//   CHAT_LOGBOOK_DATA_DIR=~/.chat-logbook-dev pnpm --filter @chat-logbook/api seed
//   ... seed --count 50000 --seed 1 --projects 50 --tag-ratio 0.3 --tag-pool 10

function parseArgs(argv: string[]): Partial<SeedConfig> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      flags[arg.slice(2)] = argv[++i] ?? "";
    }
  }
  const num = (key: string): number | undefined =>
    flags[key] === undefined ? undefined : Number(flags[key]);

  const config: Partial<SeedConfig> = {};
  const count = num("count");
  const seed = num("seed");
  const projects = num("projects");
  const tagRatio = num("tag-ratio");
  const tagPool = num("tag-pool");
  if (count !== undefined) config.count = count;
  if (seed !== undefined) config.seed = seed;
  if (projects !== undefined) config.projects = projects;
  if (tagRatio !== undefined) config.tagRatio = tagRatio;
  if (tagPool !== undefined) config.tagPool = tagPool;
  return config;
}

const config = parseArgs(process.argv.slice(2));
const dataDir = resolveDataDir(process.env, os.homedir());
assertSeedDataDirSafe(dataDir, os.homedir());

const resolved = { ...DEFAULT_SEED_CONFIG, ...config };
console.log(
  `Seeding ${resolved.count} chats (seed=${resolved.seed}, ` +
    `projects=${resolved.projects}, tagRatio=${resolved.tagRatio}, ` +
    `tagPool=${resolved.tagPool}) into ${dataDir} ...`
);

const start = Date.now();
const archive = createArchiveRepository({ dataDir });
const tags = createTagRepository({ dataDir });
const summary = seedArchive({ archive, tags }, config);
archive.close();

const seconds = ((Date.now() - start) / 1000).toFixed(1);
console.log(
  `Done in ${seconds}s: ${summary.chats} chats, ` +
    `${summary.namedProjects} named projects, ${summary.tags} tags, ` +
    `${summary.taggedChats} tagged chats.`
);
