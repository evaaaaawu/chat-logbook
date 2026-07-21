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

    it("exposes the full cwd as projectPath", async () => {
      const refs = await collect(plugin.discover({ homeDir: tmpHome }));
      expect(refs).toHaveLength(1);
      expect(refs[0].projectPath).toBe("/Users/test/my-app");
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

  it("carries a tool_result's error flag through as isError", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: "command not found",
              is_error: true,
            },
          ],
        },
        isMeta: false,
        isSidechain: false,
        uuid: "msg-8",
        timestamp: "2024-01-01T00:00:08Z",
      })
    );

    expect(result?.blocks).toEqual([
      {
        type: "tool_result",
        toolUseId: "tool-1",
        content: "command not found",
        isError: true,
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

describe("ClaudeCodePlugin.normalize → slash commands", () => {
  it("translates command markup into a single command block", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content:
            "<command-message>tdd</command-message>\n<command-name>/tdd</command-name>\n<command-args>issue 191</command-args>",
        },
        uuid: "msg-cmd",
        timestamp: "2024-01-01T00:00:03Z",
        sessionId: "session-1",
      })
    );

    expect(result?.blocks).toEqual([
      { type: "command", name: "/tdd", args: "issue 191" },
    ]);
  });

  it("gives an empty args string when the invocation carries no arguments", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content:
            "<command-message>commit</command-message>\n<command-name>/commit</command-name>",
        },
        uuid: "msg-cmd-2",
        timestamp: "2024-01-01T00:00:04Z",
        sessionId: "session-1",
      })
    );

    expect(result?.blocks).toEqual([
      { type: "command", name: "/commit", args: "" },
    ]);
  });

  it("preserves multi-line arguments verbatim", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content:
            "<command-message>grill-me</command-message>\n<command-name>/grill-me</command-name>\n<command-args>first line\nsecond line</command-args>",
        },
        uuid: "msg-cmd-3",
        timestamp: "2024-01-01T00:00:05Z",
        sessionId: "session-1",
      })
    );

    expect(result?.blocks).toEqual([
      { type: "command", name: "/grill-me", args: "first line\nsecond line" },
    ]);
  });

  it("sets the searchable text to the command line so titles read `/tdd issue 191`", () => {
    const withArgs = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content:
            "<command-message>tdd</command-message>\n<command-name>/tdd</command-name>\n<command-args>issue 191</command-args>",
        },
        uuid: "msg-cmd-4",
        timestamp: "2024-01-01T00:00:06Z",
        sessionId: "session-1",
      })
    );
    expect(withArgs?.text).toBe("/tdd issue 191");

    const noArgs = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content:
            "<command-message>commit</command-message>\n<command-name>/commit</command-name>",
        },
        uuid: "msg-cmd-5",
        timestamp: "2024-01-01T00:00:07Z",
        sessionId: "session-1",
      })
    );
    expect(noArgs?.text).toBe("/commit");
  });
});

const TASK_NOTIFICATION = [
  "<task-notification>",
  "<task-id>a09d714025def2e83</task-id>",
  "<tool-use-id>toolu_01SCVdD2uM7eki7WUj6siHyS</tool-use-id>",
  "<status>completed</status>",
  '<summary>Agent "Run App test (batch trash)" finished</summary>',
  "<result>Total tests: 85. Passed: 83. Failed: 2.</result>",
  "</task-notification>",
].join("\n");

describe("ClaudeCodePlugin.normalize → system rows", () => {
  it("translates a task-notification into a single system block", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: { role: "user", content: TASK_NOTIFICATION },
        uuid: "msg-sys-1",
        timestamp: "2024-01-01T00:00:08Z",
        sessionId: "session-1",
      })
    );

    expect(result?.blocks).toEqual([
      {
        type: "system",
        kind: "task-notification",
        summary: 'Agent "Run App test (batch trash)" finished',
        detail: TASK_NOTIFICATION,
      },
    ]);
  });

  it("falls back to a generic summary when the notification carries none", () => {
    const noSummary =
      "<task-notification>\n<task-id>abc</task-id>\n<status>stopped</status>\n</task-notification>";

    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: { role: "user", content: noSummary },
        uuid: "msg-sys-2",
        timestamp: "2024-01-01T00:00:09Z",
        sessionId: "session-1",
      })
    );

    // Still a system row, never a text block: the point is that no raw markup
    // reaches the reader, summary or not.
    expect(result?.blocks).toEqual([
      {
        type: "system",
        kind: "task-notification",
        summary: "Task notification",
        detail: noSummary,
      },
    ]);
  });

  it("translates a local command echo into its own system kind", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content:
            "<local-command-stdout>Set model to claude-opus-4-8</local-command-stdout>",
        },
        uuid: "msg-sys-3",
        timestamp: "2024-01-01T00:00:10Z",
        sessionId: "session-1",
      })
    );

    // The echo is already one line, so it is wholly the summary — there is no
    // detail worth expanding into.
    expect(result?.blocks).toEqual([
      {
        type: "system",
        kind: "local-command-stdout",
        summary: "Set model to claude-opus-4-8",
        detail: "",
      },
    ]);
  });

  it("strips terminal styling codes out of a local command echo", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: {
          role: "user",
          content:
            "<local-command-stdout>Set model to \u001b[1mOpus 4.6\u001b[22m with \u001b[1mhigh\u001b[22m effort</local-command-stdout>",
        },
        uuid: "msg-sys-4",
        timestamp: "2024-01-01T00:00:11Z",
        sessionId: "session-1",
      })
    );

    expect(result?.blocks).toEqual([
      {
        type: "system",
        kind: "local-command-stdout",
        summary: "Set model to Opus 4.6 with high effort",
        detail: "",
      },
    ]);
  });
});

describe("ClaudeCodePlugin.normalize → model capture", () => {
  it("captures the model id the Agent recorded on an assistant message", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "assistant",
        message: {
          role: "assistant",
          model: "claude-opus-4-8",
          content: [{ type: "text", text: "Done." }],
        },
        uuid: "msg-model-1",
        timestamp: "2024-01-01T00:00:20Z",
        sessionId: "session-1",
      })
    );

    expect(result?.model).toBe("claude-opus-4-8");
  });

  it("leaves model absent on a reader turn, which records none", () => {
    const result = plugin.normalize(
      rawRecord({
        type: "user",
        message: { role: "user", content: "What changed?" },
        uuid: "msg-model-2",
        timestamp: "2024-01-01T00:00:21Z",
        sessionId: "session-1",
      })
    );

    expect(result).not.toHaveProperty("model");
  });
});

describe("ClaudeCodePlugin.normalize → inline images", () => {
  it("emits an image block carrying media type and a ref, never the bytes", () => {
    const result = plugin.normalize(
      rawRecord({
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
        uuid: "msg-img-1",
        timestamp: "2024-01-01T00:00:30Z",
        sessionId: "session-1",
      })
    );

    expect(result?.blocks).toEqual([
      { type: "text", text: "Look at this" },
      { type: "image", mediaType: "image/png", ref: "msg-img-1.1" },
    ]);
    // The bytes stay in Raw; Normalized must not double the archive's image
    // storage (ADR-0023).
    expect(JSON.stringify(result)).not.toContain("iVBORw0KGgo=");
  });
});

describe("ClaudeCodePlugin.normalize → visualize widgets", () => {
  function widgetCall(widgetCode: string) {
    return rawRecord({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_w1",
            name: "mcp__visualize__show_widget",
            input: { title: "arch_diagram", widget_code: widgetCode },
          },
        ],
      },
      uuid: "msg-w-1",
      timestamp: "2024-01-01T00:00:40Z",
      sessionId: "session-1",
    });
  }

  it("emits an image block beside the tool row when the widget is SVG", () => {
    const svg = '<svg viewBox="0 0 680 200"><text class="t">Hi</text></svg>';
    const result = plugin.normalize(widgetCall(svg));

    // The tool row stays: the reader can still open the widget's source.
    expect(result?.blocks).toEqual([
      {
        type: "tool_use",
        id: "toolu_w1",
        name: "mcp__visualize__show_widget",
        input: { title: "arch_diagram", widget_code: svg },
      },
      { type: "image", mediaType: "image/svg+xml", ref: "msg-w-1.0" },
    ]);
  });

  // HTML widgets earn their keep by being interactive, which serving them would
  // mean executing archived code. They stay a tool row the reader can expand.
  it("leaves an HTML widget as a bare tool row", () => {
    const html = '<div style="padding:8px">Before and after</div>';
    const result = plugin.normalize(widgetCall(html));

    expect(result?.blocks).toEqual([
      {
        type: "tool_use",
        id: "toolu_w1",
        name: "mcp__visualize__show_widget",
        input: { title: "arch_diagram", widget_code: html },
      },
    ]);
  });
});
