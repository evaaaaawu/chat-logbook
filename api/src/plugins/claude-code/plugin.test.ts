import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { ClaudeCodePlugin } from "./plugin.js";
import type { RawRecord, ChatRef } from "../types.js";

const plugin = new ClaudeCodePlugin();
const homeDir = path.join(import.meta.dirname, "__fixtures__", "home");

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

function rawRecord(payload: unknown): RawRecord {
  return {
    sourceId: "session-1",
    sourcePath: "/fake/session-1.jsonl",
    sourceLocator: "L1",
    payload,
  };
}

describe("ClaudeCodePlugin.discover", () => {
  it("yields one ChatRef per jsonl file under ~/.claude/projects/*/", async () => {
    const refs = await collect(plugin.discover({ homeDir }));

    expect(refs).toHaveLength(2);
    const byId = new Map(refs.map((r) => [r.sourceId, r] as const));

    const s1 = byId.get("session-1")!;
    expect(s1.sourcePath).toBe(
      path.join(homeDir, ".claude/projects/project-a/session-1.jsonl")
    );
    expect(s1.watchPaths).toEqual([s1.sourcePath]);

    expect(byId.get("session-2")).toBeDefined();
  });

  it("yields nothing when ~/.claude/projects does not exist", async () => {
    const refs = await collect(
      plugin.discover({ homeDir: "/nonexistent/path" })
    );
    expect(refs).toEqual([]);
  });

  describe("with an encoded project directory and a cwd inside the JSONL", () => {
    let tmpHome: string;

    beforeEach(() => {
      tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-cwd-"));
      const projectsDir = path.join(
        tmpHome,
        ".claude/projects/-Users-test-my-app"
      );
      fs.mkdirSync(projectsDir, { recursive: true });
      const lines = [
        JSON.stringify({ type: "file-history-snapshot", messageId: "m0" }),
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "hi" },
          uuid: "u1",
          timestamp: "2024-01-01T00:00:01Z",
          cwd: "/Users/test/my-app",
          sessionId: "sx",
        }),
      ];
      fs.writeFileSync(
        path.join(projectsDir, "sx.jsonl"),
        lines.join("\n") + "\n"
      );
    });

    afterEach(() => {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it("derives project from basename(cwd), not the encoded dir name", async () => {
      const refs = await collect(plugin.discover({ homeDir: tmpHome }));
      expect(refs).toHaveLength(1);
      expect(refs[0].project).toBe("my-app");
    });
  });

  describe("when the first cwd line sits beyond the first 64KB", () => {
    let tmpHome: string;

    beforeEach(() => {
      tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-bigcwd-"));
      const projectsDir = path.join(
        tmpHome,
        ".claude/projects/-Users-test-my-app"
      );
      fs.mkdirSync(projectsDir, { recursive: true });
      // A pasted screenshot makes the first user message a single ~80KB line
      // with no cwd; cwd only appears on the next, smaller line.
      const hugeContent = "x".repeat(80 * 1024);
      const lines = [
        JSON.stringify({ type: "file-history-snapshot", messageId: "m0" }),
        JSON.stringify({
          type: "user",
          message: { role: "user", content: hugeContent },
          uuid: "u1",
          timestamp: "2024-01-01T00:00:01Z",
        }),
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "hi" },
          uuid: "u2",
          timestamp: "2024-01-01T00:00:02Z",
          cwd: "/Users/test/my-app",
          sessionId: "sx",
        }),
      ];
      fs.writeFileSync(
        path.join(projectsDir, "sx.jsonl"),
        lines.join("\n") + "\n"
      );
    });

    afterEach(() => {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it("still derives project from cwd", async () => {
      const refs = await collect(plugin.discover({ homeDir: tmpHome }));
      expect(refs).toHaveLength(1);
      expect(refs[0].project).toBe("my-app");
    });
  });
});

describe("ClaudeCodePlugin.extractRaw", () => {
  it("yields one RawRecord per non-empty line", async () => {
    const ref: ChatRef = {
      sourceId: "session-2",
      sourcePath: path.join(
        homeDir,
        ".claude/projects/project-b/session-2.jsonl"
      ),
      watchPaths: [],
    };

    const records = await collect(plugin.extractRaw(ref));

    expect(records).toHaveLength(2);
    expect(records[0].sourceId).toBe("session-2");
    expect(records[0].sourcePath).toBe(ref.sourcePath);
    expect(records[0].sourceLocator).toBe("L1");
    expect((records[0].payload as { uuid: string }).uuid).toBe("msg-b1");
    expect(records[1].sourceLocator).toBe("L2");
  });
});

describe("ClaudeCodePlugin.normalize → null cases", () => {
  it.each([
    [
      "file-history-snapshot",
      { type: "file-history-snapshot", messageId: "x", snapshot: {} },
    ],
    ["permission-mode", { type: "permission-mode", mode: "default" }],
    [
      "system event",
      { type: "system", subtype: "turn_duration", durationMs: 5000 },
    ],
    ["progress event", { type: "progress", data: { type: "agent_progress" } }],
    [
      "isMeta user",
      {
        type: "user",
        message: {
          role: "user",
          content: "<local-command-caveat>x</local-command-caveat>",
        },
        isMeta: true,
        uuid: "msg-meta",
        timestamp: "2024-01-01T00:00:01Z",
      },
    ],
    [
      "isSidechain user",
      {
        type: "user",
        message: { role: "user", content: "side" },
        isMeta: false,
        isSidechain: true,
        uuid: "msg-side",
        timestamp: "2024-01-01T00:00:01Z",
      },
    ],
  ])("returns null for %s", (_label, payload) => {
    expect(plugin.normalize(rawRecord(payload))).toBeNull();
  });
});

describe("ClaudeCodePlugin.normalize", () => {
  it("normalizes an assistant message with thinking + text blocks", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Let me think about this..." },
            { type: "text", text: "Here's the implementation." },
          ],
        },
        uuid: "msg-5",
        timestamp: "2024-01-01T00:00:05Z",
        sessionId: "session-1",
      })
    );

    expect(result).toEqual({
      messageId: "msg-5",
      role: "assistant",
      ts: "2024-01-01T00:00:05Z",
      text: "Here's the implementation.",
      blocks: [
        { type: "thinking", thinking: "Let me think about this..." },
        { type: "text", text: "Here's the implementation." },
      ],
    });
  });

  it("normalizes an assistant tool_use block", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "Read",
              input: { file_path: "src/index.ts" },
            },
          ],
        },
        uuid: "msg-6",
        timestamp: "2024-01-01T00:00:06Z",
        sessionId: "session-1",
      })
    );

    expect(result?.blocks).toEqual([
      {
        type: "tool_use",
        id: "tool-1",
        name: "Read",
        input: { file_path: "src/index.ts" },
      },
    ]);
    expect(result?.text).toBe("");
  });

  it("normalizes a user tool_result block (renames tool_use_id → toolUseId)", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: "file contents here",
            },
          ],
        },
        isMeta: false,
        isSidechain: false,
        uuid: "msg-7",
        timestamp: "2024-01-01T00:00:07Z",
      })
    );

    expect(result?.blocks).toEqual([
      {
        type: "tool_result",
        toolUseId: "tool-1",
        content: "file contents here",
      },
    ]);
  });

  it("normalizes a user text message", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: { role: "user", content: "Build a login page" },
        isMeta: false,
        isSidechain: false,
        uuid: "msg-2",
        timestamp: "2024-01-01T00:00:02Z",
        sessionId: "session-1",
      })
    );

    expect(result).toEqual({
      messageId: "msg-2",
      role: "user",
      ts: "2024-01-01T00:00:02Z",
      text: "Build a login page",
      blocks: [{ type: "text", text: "Build a login page" }],
    });
  });
});
