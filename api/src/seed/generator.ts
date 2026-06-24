/**
 * Deterministic synthetic-dataset generator. Given a config it produces the
 * same Chats, Projects, and Tag assignments every time, so a seeded Archive is
 * reproducible. Pure: no IO, no clock, no randomness beyond the seeded PRNG —
 * the writer ({@link ./seed.js}) turns this output into real repository rows.
 */

export interface SyntheticMessage {
  messageId: string;
  role: "user" | "assistant";
  /** ISO-8601 timestamp; drives the Chat's derived createdAt/updatedAt. */
  ts: string;
  text: string;
}

export interface SyntheticChat {
  sourceId: string;
  /** `null` places the Chat in the `(No project)` group. */
  project: string | null;
  messages: SyntheticMessage[];
  /** Names of the Tags assigned to this Chat (a subset of the Tag pool). */
  tagNames: string[];
}

export interface SeedConfig {
  count: number;
  seed: number;
  /** Number of distinct named Projects to spread Chats across. */
  projects: number;
  /** Portion of Chats (0..1) that receive at least one Tag. */
  tagRatio: number;
  /** Number of distinct Tags in the pool. */
  tagPool: number;
}

export const DEFAULT_SEED_CONFIG: SeedConfig = {
  count: 50_000,
  seed: 1,
  projects: 50,
  tagRatio: 0.3,
  tagPool: 10,
};

/** Deterministic 32-bit PRNG (mulberry32): same seed yields the same stream. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDataset(
  config: Partial<SeedConfig> = {}
): SyntheticChat[] {
  const cfg: SeedConfig = { ...DEFAULT_SEED_CONFIG, ...config };
  const rng = mulberry32(cfg.seed);

  // ~15% of Chats land in the `(No project)` group; the rest spread evenly
  // across the named Project pool.
  const NO_PROJECT_RATE = 0.15;
  // Timestamps spread back from a fixed reference instant (no wall clock, so the
  // dataset stays reproducible) over a two-year window.
  const REFERENCE_END_MS = Date.parse("2026-01-01T00:00:00.000Z");
  const WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;
  const MAX_GAP_MS = 30 * 60 * 1000; // up to 30 min between messages

  const chats: SyntheticChat[] = [];
  for (let i = 0; i < cfg.count; i++) {
    const project =
      cfg.projects > 0 && rng() >= NO_PROJECT_RATE
        ? `Project ${Math.floor(rng() * cfg.projects)}`
        : null;

    const sourceId = `seed-${cfg.seed}-${i}`;
    const startMs = REFERENCE_END_MS - Math.floor(rng() * WINDOW_MS);
    const messageCount = 1 + Math.floor(rng() * 8); // 1..8 messages
    const messages: SyntheticMessage[] = [];
    let cursor = startMs;
    for (let m = 0; m < messageCount; m++) {
      if (m > 0) cursor += Math.floor(rng() * MAX_GAP_MS);
      messages.push({
        messageId: `${sourceId}-m${m}`,
        role: m % 2 === 0 ? "user" : "assistant",
        ts: new Date(cursor).toISOString(),
        text:
          m % 2 === 0
            ? `Synthetic question ${m} for ${sourceId}`
            : `Synthetic answer ${m} for ${sourceId}`,
      });
    }

    // A portion of Chats (tagRatio) get 1..3 distinct Tags from the pool, so
    // tag filtering and counts can be exercised at scale.
    const tagNames: string[] = [];
    if (cfg.tagPool > 0 && rng() < cfg.tagRatio) {
      const wanted = 1 + Math.floor(rng() * Math.min(3, cfg.tagPool));
      const picked = new Set<number>();
      while (picked.size < wanted) {
        picked.add(Math.floor(rng() * cfg.tagPool));
      }
      for (const k of picked) tagNames.push(`Tag ${k}`);
    }

    chats.push({ sourceId, project, messages, tagNames });
  }
  return chats;
}
