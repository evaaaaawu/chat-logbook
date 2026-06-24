import type { ArchiveRepository } from "../archive/repository.js";
import type { TagRepository } from "../metadata/tags.js";
import { TAG_COLORS } from "../metadata/tag-colors.js";
import {
  generateDataset,
  type SeedConfig,
  type SyntheticChat,
} from "./generator.js";

/** Every synthetic Chat is attributed to this Agent. */
const SEED_AGENT = "claude-code";

export interface SeedSummary {
  chats: number;
  /** Distinct named Projects (excludes the `(No project)` group). */
  namedProjects: number;
  tags: number;
  taggedChats: number;
}

export interface SeedDeps {
  archive: ArchiveRepository;
  tags: TagRepository;
}

/**
 * Writes a deterministic synthetic dataset into the Archive and Metadata stores
 * through the real repositories — never hand-rolled SQL — so the seeded data
 * always matches the live schema and the same write path real ingestion uses.
 * Returns a summary for the CLI to print.
 */
export function seedArchive(
  { archive, tags }: SeedDeps,
  config: Partial<SeedConfig> = {}
): SeedSummary {
  const dataset = generateDataset(config);

  // Create the Tag pool once, mapping each name to its id. Colors cycle through
  // the closed token vocabulary deterministically so a re-seed is identical.
  const tagIdByName = createTagPool(tags, dataset);

  const namedProjects = new Set<string>();
  let taggedChats = 0;

  for (const chat of dataset) {
    const firstSeenAt = new Date(chat.messages[0]?.ts ?? 0);
    const internalId = archive.ensureChat(
      SEED_AGENT,
      chat.sourceId,
      firstSeenAt,
      chat.project ?? undefined
    );
    if (chat.project !== null) namedProjects.add(chat.project);

    writeMessages(archive, chat);

    if (chat.tagNames.length > 0) taggedChats++;
    for (const name of chat.tagNames) {
      const tagId = tagIdByName.get(name);
      if (tagId) tags.assignTag(internalId, tagId);
    }
  }

  return {
    chats: dataset.length,
    namedProjects: namedProjects.size,
    tags: tagIdByName.size,
    taggedChats,
  };
}

function createTagPool(
  tags: TagRepository,
  dataset: SyntheticChat[]
): Map<string, string> {
  const names = [...new Set(dataset.flatMap((c) => c.tagNames))].sort();
  const tagIdByName = new Map<string, string>();
  names.forEach((name, i) => {
    const color = TAG_COLORS[i % TAG_COLORS.length];
    tagIdByName.set(name, tags.createTag(name, color).id);
  });
  return tagIdByName;
}

function writeMessages(archive: ArchiveRepository, chat: SyntheticChat): void {
  const sourcePath = `/seed/${chat.sourceId}.jsonl`;
  chat.messages.forEach((message, i) => {
    const payload = {
      messageId: message.messageId,
      role: message.role,
      ts: message.ts,
      text: message.text,
    };
    const raw = archive.insertRawMessage({
      agent: SEED_AGENT,
      sourceId: chat.sourceId,
      sourcePath,
      sourceLocator: `line:${i}`,
      payload,
      ingestedAt: new Date(message.ts),
    });
    archive.upsertNormalizedMessage({
      agent: SEED_AGENT,
      sourceId: chat.sourceId,
      message: {
        messageId: message.messageId,
        role: message.role,
        ts: message.ts,
        text: message.text,
        blocks: [{ type: "text", text: message.text }],
      },
      rawId: raw.id,
    });
  });
}
