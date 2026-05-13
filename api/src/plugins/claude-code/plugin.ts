import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type {
  AgentPlugin,
  CanonicalMessage,
  NormalizedBlock,
  PluginEnv,
  RawRecord,
  SessionRef,
} from "../types.js";

export class ClaudeCodePlugin implements AgentPlugin {
  readonly id = "claude-code";
  readonly displayName = "Claude Code";

  async *discover(env: PluginEnv): AsyncIterable<SessionRef> {
    const projectsDir = path.join(env.homeDir, ".claude", "projects");
    if (!fs.existsSync(projectsDir)) return;

    const projects = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const projectPath = path.join(projectsDir, project.name);
      const files = fs.readdirSync(projectPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const sourcePath = path.join(projectPath, file.name);
        const sessionId = file.name.replace(/\.jsonl$/, "");
        const cwd = readCwdFromJsonl(sourcePath);
        yield {
          sessionId,
          sourcePath,
          watchPaths: [sourcePath],
          project: cwd ? path.basename(cwd) : undefined,
        };
      }
    }
  }

  async *extractRaw(ref: SessionRef): AsyncIterable<RawRecord> {
    if (!fs.existsSync(ref.sourcePath)) return;

    const stream = fs.createReadStream(ref.sourcePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
      lineNo += 1;
      if (!line) continue;
      yield {
        sessionId: ref.sessionId,
        sourcePath: ref.sourcePath,
        sourceLocator: `L${lineNo}`,
        payload: JSON.parse(line),
      };
    }
  }

  normalize(raw: RawRecord): CanonicalMessage | null {
    const payload = raw.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") return null;

    if (payload.type !== "user" && payload.type !== "assistant") return null;
    if (payload.isMeta === true) return null;
    if (payload.isSidechain === true) return null;

    const message = payload.message as
      | { role: string; content: unknown }
      | undefined;
    if (!message) return null;

    const role = message.role === "assistant" ? "assistant" : "user";
    const messageId = String(payload.uuid ?? "");
    const ts = String(payload.timestamp ?? "");

    if (typeof message.content === "string") {
      const text = message.content;
      return {
        messageId,
        role,
        ts,
        text,
        blocks: [{ type: "text", text }],
      };
    }

    if (Array.isArray(message.content)) {
      const blocks: NormalizedBlock[] = [];
      for (const block of message.content) {
        const normalized = normalizeBlock(block);
        if (normalized) blocks.push(normalized);
      }
      const text = blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { messageId, role, ts, text, blocks };
    }

    return null;
  }
}

function readCwdFromJsonl(sourcePath: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(sourcePath, "r");
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const head = buf.subarray(0, n).toString("utf-8");
    const lines = head.split("\n");
    // Drop the last fragment; it may be a partial line if we truncated.
    if (n === buf.length) lines.pop();
    for (const line of lines) {
      if (!line) continue;
      try {
        const obj = JSON.parse(line) as { cwd?: unknown };
        if (typeof obj.cwd === "string" && obj.cwd.length > 0) {
          return obj.cwd;
        }
      } catch {
        // Ignore malformed lines.
      }
    }
  } catch {
    // Ignore I/O errors; fall back to undefined project.
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

function normalizeBlock(raw: unknown): NormalizedBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  switch (b.type) {
    case "text":
      return { type: "text", text: String(b.text ?? "") };
    case "thinking":
      return { type: "thinking", thinking: String(b.thinking ?? "") };
    case "tool_use":
      return {
        type: "tool_use",
        id: String(b.id ?? ""),
        name: String(b.name ?? ""),
        input: b.input,
      };
    case "tool_result":
      return {
        type: "tool_result",
        toolUseId: String(b.tool_use_id ?? ""),
        content: b.content,
      };
    default:
      return null;
  }
}
