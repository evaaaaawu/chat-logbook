import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTagRepository } from "./tags.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-tags-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("TagRepository", () => {
  it("creates a tag and lists it", () => {
    const repo = createTagRepository({ dataDir });

    const tag = repo.createTag("bug", "red");

    expect(tag.name).toBe("bug");
    expect(tag.color).toBe("red");
    expect(tag.id).toEqual(expect.any(String));
    expect(repo.listTags()).toEqual([tag]);
  });

  it("rejects creating a tag with a color outside the palette", () => {
    const repo = createTagRepository({ dataDir });

    expect(() => repo.createTag("bug", "#ff0000" as never)).toThrow();
    expect(repo.listTags()).toEqual([]);
  });

  it("allows reusing one color across several tags", () => {
    const repo = createTagRepository({ dataDir });

    repo.createTag("bug", "violet");
    repo.createTag("idea", "violet");

    expect(repo.listTags().map((t) => t.color)).toEqual(["violet", "violet"]);
  });

  it("renames a tag", () => {
    const repo = createTagRepository({ dataDir });
    const tag = repo.createTag("bug", "red");

    repo.renameTag(tag.id, "defect");

    expect(repo.listTags()).toEqual([{ ...tag, name: "defect" }]);
  });

  it("recolors a tag", () => {
    const repo = createTagRepository({ dataDir });
    const tag = repo.createTag("bug", "red");

    repo.recolorTag(tag.id, "blue");

    expect(repo.listTags()).toEqual([{ ...tag, color: "blue" }]);
  });

  it("rejects recoloring a tag to a color outside the palette", () => {
    const repo = createTagRepository({ dataDir });
    const tag = repo.createTag("bug", "red");

    expect(() => repo.recolorTag(tag.id, "#000" as never)).toThrow();
    expect(repo.listTags()).toEqual([tag]);
  });

  it("assigns a tag to a chat and lists it for that chat", () => {
    const repo = createTagRepository({ dataDir });
    const tag = repo.createTag("bug", "red");

    repo.assignTag("chat-1", tag.id);

    expect(repo.listTagsForChat("chat-1")).toEqual([tag]);
    expect(repo.listTagsForChat("chat-2")).toEqual([]);
  });

  it("treats re-assigning the same tag to a chat as an idempotent no-op", () => {
    const repo = createTagRepository({ dataDir });
    const tag = repo.createTag("bug", "red");

    repo.assignTag("chat-1", tag.id);
    repo.assignTag("chat-1", tag.id);

    expect(repo.listTagsForChat("chat-1")).toEqual([tag]);
  });

  it("removes a tag from a chat", () => {
    const repo = createTagRepository({ dataDir });
    const tag = repo.createTag("bug", "red");
    repo.assignTag("chat-1", tag.id);

    repo.removeTag("chat-1", tag.id);

    expect(repo.listTagsForChat("chat-1")).toEqual([]);
  });

  it("deletes a tag, drops it from every chat, and reports the affected count", () => {
    const repo = createTagRepository({ dataDir });
    const tag = repo.createTag("bug", "red");
    repo.assignTag("chat-1", tag.id);
    repo.assignTag("chat-2", tag.id);

    const result = repo.deleteTag(tag.id);

    expect(result).toEqual({ removedFromChats: 2 });
    expect(repo.listTags()).toEqual([]);
    expect(repo.listTagsForChat("chat-1")).toEqual([]);
    expect(repo.listTagsForChat("chat-2")).toEqual([]);
  });

  it("groups tags by chat in a single batched query", () => {
    const repo = createTagRepository({ dataDir });
    const bug = repo.createTag("bug", "red");
    const idea = repo.createTag("idea", "violet");
    repo.assignTag("chat-1", bug.id);
    repo.assignTag("chat-1", idea.id);
    repo.assignTag("chat-2", bug.id);

    const byChat = repo.listTagsByChat();

    expect(byChat.get("chat-1")).toEqual([bug, idea]);
    expect(byChat.get("chat-2")).toEqual([bug]);
    expect(byChat.has("chat-3")).toBe(false);
  });

  it("persists tags and assignments across repository instances", () => {
    const first = createTagRepository({ dataDir });
    const tag = first.createTag("bug", "red");
    first.assignTag("chat-1", tag.id);

    const second = createTagRepository({ dataDir });

    expect(second.listTags()).toEqual([tag]);
    expect(second.listTagsForChat("chat-1")).toEqual([tag]);
  });

  it("adds a tag to every listed chat in one batch, idempotent on chats that already have it", () => {
    const repo = createTagRepository({ dataDir });
    const bug = repo.createTag("bug", "red");
    // chat-1 already carries the tag; the batch must not duplicate it.
    repo.assignTag("chat-1", bug.id);

    repo.assignTagsBatch(["chat-1", "chat-2", "chat-3"], {
      add: [bug.id],
      remove: [],
    });

    expect(repo.listTagsForChat("chat-1")).toEqual([bug]);
    expect(repo.listTagsForChat("chat-2")).toEqual([bug]);
    expect(repo.listTagsForChat("chat-3")).toEqual([bug]);
  });

  it("removes a tag from every listed chat in one batch", () => {
    const repo = createTagRepository({ dataDir });
    const bug = repo.createTag("bug", "red");
    repo.assignTag("chat-1", bug.id);
    repo.assignTag("chat-2", bug.id);

    repo.assignTagsBatch(["chat-1", "chat-2"], { add: [], remove: [bug.id] });

    expect(repo.listTagsForChat("chat-1")).toEqual([]);
    expect(repo.listTagsForChat("chat-2")).toEqual([]);
  });

  it("applies a mixed add/remove diff over the selection in one call", () => {
    const repo = createTagRepository({ dataDir });
    const bug = repo.createTag("bug", "red");
    const idea = repo.createTag("idea", "violet");
    repo.assignTag("chat-1", bug.id);
    repo.assignTag("chat-2", bug.id);

    // Swap bug → idea across both chats in a single transaction.
    repo.assignTagsBatch(["chat-1", "chat-2"], {
      add: [idea.id],
      remove: [bug.id],
    });

    expect(repo.listTagsForChat("chat-1")).toEqual([idea]);
    expect(repo.listTagsForChat("chat-2")).toEqual([idea]);
  });

  it("treats an empty chat set or empty diff as a no-op", () => {
    const repo = createTagRepository({ dataDir });
    const bug = repo.createTag("bug", "red");
    repo.assignTag("chat-1", bug.id);

    repo.assignTagsBatch([], { add: [bug.id], remove: [] });
    repo.assignTagsBatch(["chat-1"], { add: [], remove: [] });

    expect(repo.listTagsForChat("chat-1")).toEqual([bug]);
  });
});
