import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "../archive/repository.js";
import { createMetadataRepository } from "../metadata/repository.js";
import { createTagRepository } from "../metadata/tags.js";
import { createChatReader } from "../chat-reader.js";
import { seedArchive } from "./seed.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-seed-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function openReader() {
  const archive = createArchiveRepository({ dataDir });
  const metadata = createMetadataRepository({ dataDir });
  const tags = createTagRepository({ dataDir });
  return {
    archive,
    metadata,
    tags,
    reader: createChatReader({ archive, metadata, tags }),
  };
}

describe("seedArchive", () => {
  it("seeds chats that the read path lists end-to-end", () => {
    const archive = createArchiveRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    const summary = seedArchive({ archive, tags }, { count: 25, seed: 3 });
    archive.close();

    expect(summary.chats).toBe(25);

    const { reader } = openReader();
    const listed = reader.listChats({ includeTrashed: false });
    expect(listed).toHaveLength(25);
  });

  it("seeds chats spanning many projects including the (No project) group", () => {
    const archive = createArchiveRepository({ dataDir });
    const tags = createTagRepository({ dataDir });
    const summary = seedArchive(
      { archive, tags },
      { count: 80, seed: 5, projects: 6 }
    );
    archive.close();
    expect(summary.namedProjects).toBeGreaterThan(1);

    const { reader } = openReader();
    const noProject = reader.listChats({
      includeTrashed: false,
      projects: [""],
    });
    expect(noProject.length).toBeGreaterThan(0);
    expect(noProject.every((c) => c.project === "")).toBe(true);

    const all = reader.listChats({ includeTrashed: false });
    expect(all.some((c) => c.project !== "")).toBe(true);
    // Generous margin: these seed through the repos one autocommit at a time,
    // which is slower on shared CI runners than locally.
  }, 30000);

  it("assigns tags reproducibly and supports tag filtering", () => {
    function seedInto(dir: string) {
      const archive = createArchiveRepository({ dataDir: dir });
      const tags = createTagRepository({ dataDir: dir });
      seedArchive(
        { archive, tags },
        { count: 100, seed: 9, tagRatio: 0.5, tagPool: 6 }
      );
      archive.close();

      const archive2 = createArchiveRepository({ dataDir: dir });
      const metadata2 = createMetadataRepository({ dataDir: dir });
      const tags2 = createTagRepository({ dataDir: dir });
      const reader = createChatReader({
        archive: archive2,
        metadata: metadata2,
        tags: tags2,
      });
      return { reader, tags: tags2 };
    }

    const first = seedInto(dataDir);

    // A tag filter returns a non-empty subset, every member holding that tag.
    const someTag = first.tags.listTags()[0];
    const filtered = first.reader.listChats({
      includeTrashed: false,
      tags: [someTag.id],
    });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((c) => c.tags.some((t) => t.id === someTag.id))).toBe(
      true
    );

    // Same seed in a fresh directory yields the same sourceId -> tag-names map.
    const tagFingerprint = (r: ReturnType<typeof seedInto>["reader"]) =>
      new Map(
        r.listChats({ includeTrashed: false }).map((c) => [
          c.sourceId,
          c.tags
            .map((t) => t.name)
            .sort()
            .join(","),
        ])
      );

    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-seed2-"));
    try {
      const second = seedInto(dir2);
      expect(tagFingerprint(second.reader)).toEqual(
        tagFingerprint(first.reader)
      );
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  }, 30000);
});
