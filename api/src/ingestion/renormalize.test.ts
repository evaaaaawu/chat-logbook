import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "../archive/repository.js";
import { ClaudeCodePlugin } from "../plugins/claude-code/plugin.js";
import {
  NORMALIZE_VERSION,
  renormalizeFromRaw,
  runRenormalizeIfStale,
} from "./renormalize.js";

let dataDir: string;

beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-renorm-"));
  dataDir = path.join(tmp, "data");
  fs.mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(path.dirname(dataDir), { recursive: true, force: true });
});

const COMMAND_MARKUP =
  "<command-message>tdd</command-message>\n<command-name>/tdd</command-name>\n<command-args>issue 191</command-args>";

/**
 * Seed one raw slash-command row plus the *stale* normalized row a pre-command
 * plugin would have produced (the raw markup as a text block). Re-normalize
 * should rebuild it into a command block from the Raw layer alone.
 */
function seedStaleCommand(
  archive: ReturnType<typeof createArchiveRepository>
): { rawId: number } {
  archive.ensureChat("claude-code", "session-1", new Date(1700000000000));
  const payload = {
    type: "user",
    message: { role: "user", content: COMMAND_MARKUP },
    uuid: "m-cmd",
    timestamp: "2024-01-01T00:00:00Z",
    sessionId: "session-1",
  };
  const { id: rawId } = archive.insertRawMessage({
    agent: "claude-code",
    sourceId: "session-1",
    sourcePath: "/fake/session-1.jsonl",
    sourceLocator: "L1",
    payload,
    ingestedAt: new Date(1700000000000),
  });
  archive.upsertNormalizedMessage({
    agent: "claude-code",
    sourceId: "session-1",
    rawId,
    message: {
      messageId: "m-cmd",
      role: "user",
      ts: "2024-01-01T00:00:00Z",
      text: COMMAND_MARKUP,
      blocks: [{ type: "text", text: COMMAND_MARKUP }],
    },
  });
  return { rawId };
}

describe("renormalizeFromRaw", () => {
  it("rebuilds a stale normalized row from Raw so it gains the command block", () => {
    const archive = createArchiveRepository({ dataDir });
    seedStaleCommand(archive);

    renormalizeFromRaw({ plugins: [new ClaudeCodePlugin()], archive });

    const messages = archive.read.listMessagesByChat(
      "claude-code",
      "session-1"
    );
    expect(messages[0].blocks).toEqual([
      { type: "command", name: "/tdd", args: "issue 191" },
    ]);

    archive.close();
  });

  it("backfills an edit's patch onto a row normalized before #235", () => {
    const archive = createArchiveRepository({ dataDir });
    const hunk = {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: ["-old", "+new"],
    };
    archive.ensureChat("claude-code", "session-1", new Date(1700000000000));
    const { id: rawId } = archive.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/fake/session-1.jsonl",
      sourceLocator: "L1",
      payload: {
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "updated" },
          ],
        },
        toolUseResult: { filePath: "/repo/a.ts", structuredPatch: [hunk] },
        uuid: "m-edit",
        timestamp: "2024-01-01T00:00:00Z",
        sessionId: "session-1",
      },
      ingestedAt: new Date(1700000000000),
    });
    // The stale row a pre-#235 plugin wrote: the prose result, no patch.
    archive.upsertNormalizedMessage({
      agent: "claude-code",
      sourceId: "session-1",
      rawId,
      message: {
        messageId: "m-edit",
        role: "user",
        ts: "2024-01-01T00:00:00Z",
        text: "",
        blocks: [{ type: "tool_result", toolUseId: "t1", content: "updated" }],
      },
    });

    renormalizeFromRaw({ plugins: [new ClaudeCodePlugin()], archive });

    expect(
      archive.read.listMessagesByChat("claude-code", "session-1")[0].blocks
    ).toEqual([
      {
        type: "tool_result",
        toolUseId: "t1",
        content: "updated",
        filePath: "/repo/a.ts",
        patch: [hunk],
      },
    ]);

    archive.close();
  });

  it("is ahead of the version that shipped widget drawings, so #235 re-normalizes", () => {
    // Version 7 shipped the reasoning effort (#234). The edit patch is the next
    // normalize-output change, and only a bump reaches chats whose Source files
    // are long gone.
    expect(NORMALIZE_VERSION).toBeGreaterThanOrEqual(8);
  });

  it("leaves the Raw layer byte-identical", () => {
    const archive = createArchiveRepository({ dataDir });
    seedStaleCommand(archive);

    const rawBefore = archive.read.listRawMessages();
    renormalizeFromRaw({ plugins: [new ClaudeCodePlugin()], archive });
    const rawAfter = archive.read.listRawMessages();

    expect(rawAfter).toEqual(rawBefore);

    archive.close();
  });

  it("is idempotent: a second pass yields the same normalized content", () => {
    const archive = createArchiveRepository({ dataDir });
    seedStaleCommand(archive);
    const plugins = [new ClaudeCodePlugin()];

    renormalizeFromRaw({ plugins, archive });
    const first = archive.read.listMessagesByChat("claude-code", "session-1");
    renormalizeFromRaw({ plugins, archive });
    const second = archive.read.listMessagesByChat("claude-code", "session-1");

    expect(second).toEqual(first);
    expect(second[0].blocks).toEqual([
      { type: "command", name: "/tdd", args: "issue 191" },
    ]);

    archive.close();
  });

  it("backfills a tool_result's is_error flag onto a pre-ADR-0023 normalized row", () => {
    const archive = createArchiveRepository({ dataDir });
    archive.ensureChat("claude-code", "session-1", new Date(1700000000000));
    const payload = {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "boom",
            is_error: true,
          },
        ],
      },
      uuid: "m-tr",
      timestamp: "2024-01-01T00:00:00Z",
      sessionId: "session-1",
    };
    const { id: rawId } = archive.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/fake/session-1.jsonl",
      sourceLocator: "L1",
      payload,
      ingestedAt: new Date(1700000000000),
    });
    // The stale row a pre-ADR-0023 plugin wrote: no isError flag.
    archive.upsertNormalizedMessage({
      agent: "claude-code",
      sourceId: "session-1",
      rawId,
      message: {
        messageId: "m-tr",
        role: "user",
        ts: "2024-01-01T00:00:00Z",
        text: "",
        blocks: [{ type: "tool_result", toolUseId: "t1", content: "boom" }],
      },
    });

    renormalizeFromRaw({ plugins: [new ClaudeCodePlugin()], archive });

    const messages = archive.read.listMessagesByChat(
      "claude-code",
      "session-1"
    );
    expect(messages[0].blocks).toEqual([
      { type: "tool_result", toolUseId: "t1", content: "boom", isError: true },
    ]);

    archive.close();
  });
});

describe("runRenormalizeIfStale", () => {
  it("runs once when the stored version is behind the target, then stamps it", () => {
    const archive = createArchiveRepository({ dataDir });
    seedStaleCommand(archive);
    const plugins = [new ClaudeCodePlugin()];

    // A fresh archive starts below any target, so the first pass runs.
    expect(archive.getNormalizeVersion()).toBe(0);
    const first = runRenormalizeIfStale({ archive, plugins, targetVersion: 1 });

    expect(first).toBe(true);
    expect(archive.getNormalizeVersion()).toBe(1);
    expect(
      archive.read.listMessagesByChat("claude-code", "session-1")[0].blocks
    ).toEqual([{ type: "command", name: "/tdd", args: "issue 191" }]);

    archive.close();
  });

  it("is a no-op when the stored version already meets the target", () => {
    const archive = createArchiveRepository({ dataDir });
    seedStaleCommand(archive);
    const plugins = [new ClaudeCodePlugin()];

    runRenormalizeIfStale({ archive, plugins, targetVersion: 1 });
    const second = runRenormalizeIfStale({
      archive,
      plugins,
      targetVersion: 1,
    });

    expect(second).toBe(false);
    expect(archive.getNormalizeVersion()).toBe(1);

    archive.close();
  });
});

describe("renormalizeFromRaw → model backfill", () => {
  it("backfills the model on a row normalized before the field existed", () => {
    const archive = createArchiveRepository({ dataDir });
    archive.ensureChat("claude-code", "session-1", new Date(1700000000000));
    const { id: rawId } = archive.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/fake/session-1.jsonl",
      sourceLocator: "L1",
      payload: {
        type: "assistant",
        message: {
          role: "assistant",
          model: "claude-opus-4-8",
          content: [{ type: "text", text: "Done." }],
        },
        uuid: "m-model",
        timestamp: "2024-01-01T00:00:00Z",
        sessionId: "session-1",
      },
      ingestedAt: new Date(1700000000000),
    });
    // The pre-#195 normalized row: same content, no model.
    archive.upsertNormalizedMessage({
      agent: "claude-code",
      sourceId: "session-1",
      rawId,
      message: {
        messageId: "m-model",
        role: "assistant",
        ts: "2024-01-01T00:00:00Z",
        text: "Done.",
        blocks: [{ type: "text", text: "Done." }],
      },
    });

    renormalizeFromRaw({ plugins: [new ClaudeCodePlugin()], archive });

    const messages = archive.read.listMessagesByChat(
      "claude-code",
      "session-1"
    );
    expect(messages[0].model).toBe("claude-opus-4-8");

    archive.close();
  });
});

describe("NORMALIZE_VERSION", () => {
  it("is ahead of the version that shipped the system block, so #195 re-normalizes", () => {
    // The backfill only reaches dormant chats when the archive reads as behind.
    // Version 2 shipped the `system` block (#194); capturing the model (#195)
    // is the next normalize-output change.
    expect(NORMALIZE_VERSION).toBeGreaterThanOrEqual(3);
  });
});

describe("renormalizeFromRaw → visualize widgets", () => {
  const WIDGET_SVG =
    '<svg viewBox="0 0 680 200"><text class="t">Hi</text></svg>';

  it("surfaces a widget image in a chat archived before widgets were drawn", () => {
    const archive = createArchiveRepository({ dataDir });
    archive.ensureChat("claude-code", "session-1", new Date(1700000000000));
    const toolUse = {
      type: "tool_use",
      id: "toolu_w1",
      name: "mcp__visualize__show_widget",
      input: { title: "diagram", widget_code: WIDGET_SVG },
    };
    const { id: rawId } = archive.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/fake/session-1.jsonl",
      sourceLocator: "L1",
      payload: {
        type: "assistant",
        message: { role: "assistant", content: [toolUse] },
        uuid: "m-wid",
        timestamp: "2024-01-01T00:00:00Z",
        sessionId: "session-1",
      },
      ingestedAt: new Date(1700000000000),
    });
    // The stale row a pre-widget plugin produced: a bare tool row, the drawing
    // invisible.
    archive.upsertNormalizedMessage({
      agent: "claude-code",
      sourceId: "session-1",
      rawId,
      message: {
        messageId: "m-wid",
        role: "assistant",
        ts: "2024-01-01T00:00:00Z",
        text: "",
        blocks: [
          {
            type: "tool_use",
            id: "toolu_w1",
            name: "mcp__visualize__show_widget",
            input: { title: "diagram", widget_code: WIDGET_SVG },
          },
        ],
      },
    });

    renormalizeFromRaw({ archive, plugins: [new ClaudeCodePlugin()] });

    expect(
      archive.read.listMessagesByChat("claude-code", "session-1")[0].blocks
    ).toEqual([
      {
        type: "tool_use",
        id: "toolu_w1",
        name: "mcp__visualize__show_widget",
        input: { title: "diagram", widget_code: WIDGET_SVG },
      },
      { type: "image", mediaType: "image/svg+xml", ref: "m-wid.0" },
    ]);

    archive.close();
  });

  it("is ahead of the version that shipped inline images, so #230 re-normalizes", () => {
    // Version 4 shipped the `image` block for pasted screenshots (#196). Drawing
    // archived widgets is the next normalize-output change, and only a bump
    // reaches chats whose Source files are long gone.
    expect(NORMALIZE_VERSION).toBeGreaterThanOrEqual(5);
  });
});

describe("renormalizeFromRaw → inline images", () => {
  it("surfaces images in a chat archived before images were normalized", () => {
    const archive = createArchiveRepository({ dataDir });
    archive.ensureChat("claude-code", "session-1", new Date(1700000000000));
    const { id: rawId } = archive.insertRawMessage({
      agent: "claude-code",
      sourceId: "session-1",
      sourcePath: "/fake/session-1.jsonl",
      sourceLocator: "L1",
      payload: {
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Look at this" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "iVBORw0KGgo=",
              },
            },
          ],
        },
        uuid: "m-img",
        timestamp: "2024-01-01T00:00:00Z",
        sessionId: "session-1",
      },
      ingestedAt: new Date(1700000000000),
    });
    // The stale row a pre-image plugin produced: the image was simply dropped.
    archive.upsertNormalizedMessage({
      agent: "claude-code",
      sourceId: "session-1",
      rawId,
      message: {
        messageId: "m-img",
        role: "user",
        ts: "2024-01-01T00:00:00Z",
        text: "Look at this",
        blocks: [{ type: "text", text: "Look at this" }],
      },
    });

    renormalizeFromRaw({ archive, plugins: [new ClaudeCodePlugin()] });

    expect(
      archive.read.listMessagesByChat("claude-code", "session-1")[0].blocks
    ).toEqual([
      { type: "text", text: "Look at this" },
      { type: "image", mediaType: "image/png", ref: "m-img.1" },
    ]);

    archive.close();
  });

  it("re-normalizes an archive stamped at the pre-image version", () => {
    const archive = createArchiveRepository({ dataDir });
    seedStaleCommand(archive);
    // Version 3 is where the archive sits before this change; a boot on it must
    // still have a pass to run, which is what carries images to dormant chats.
    archive.setNormalizeVersion(3);

    const ran = runRenormalizeIfStale({
      archive,
      plugins: [new ClaudeCodePlugin()],
    });

    expect(ran).toBe(true);
    expect(archive.getNormalizeVersion()).toBe(NORMALIZE_VERSION);

    archive.close();
  });
});
