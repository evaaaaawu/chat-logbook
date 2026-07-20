import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type {
  AgentPlugin,
  NormalizedMessage,
  NormalizedBlock,
  PluginEnv,
  RawRecord,
  ChatRef,
} from "../types.js";

export class ClaudeCodePlugin implements AgentPlugin {
  readonly id = "claude-code";
  readonly displayName = "Claude Code";

  async *discover(env: PluginEnv): AsyncIterable<ChatRef> {
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
        const sourceId = file.name.replace(/\.jsonl$/, "");
        const cwd = await readCwdFromJsonl(sourcePath);
        yield {
          sourceId,
          sourcePath,
          watchPaths: [sourcePath],
          project: cwd ? path.basename(cwd) : undefined,
          projectPath: cwd ?? undefined,
        };
      }
    }
  }

  async *extractRaw(ref: ChatRef): AsyncIterable<RawRecord> {
    if (!fs.existsSync(ref.sourcePath)) return;

    const stream = fs.createReadStream(ref.sourcePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of rl) {
      lineNo += 1;
      if (!line) continue;
      yield {
        sourceId: ref.sourceId,
        sourcePath: ref.sourcePath,
        sourceLocator: `L${lineNo}`,
        payload: JSON.parse(line),
      };
    }
  }

  normalize(raw: RawRecord): NormalizedMessage | null {
    const payload = raw.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") return null;

    if (payload.type !== "user" && payload.type !== "assistant") return null;
    if (payload.isMeta === true) return null;
    if (payload.isSidechain === true) return null;

    const message = payload.message as
      | { role: string; content: unknown; model?: unknown }
      | undefined;
    if (!message) return null;

    const role = message.role === "assistant" ? "assistant" : "user";
    const messageId = String(payload.uuid ?? "");
    const ts = String(payload.timestamp ?? "");
    // Claude Code records the model on each assistant message; reader turns
    // carry none. Spread so the field is absent rather than undefined (ADR-0023).
    const model =
      typeof message.model === "string" && message.model !== ""
        ? { model: message.model }
        : {};

    if (typeof message.content === "string") {
      const command = parseCommandMarkup(message.content);
      if (command) {
        // The searchable text is the command line (`/tdd issue 191`), so FTS
        // finds it and a chat whose first turn is a slash command derives that
        // as its title instead of the raw markup.
        const commandLine = `${command.name} ${command.args}`.trim();
        return {
          messageId,
          role,
          ts,
          text: commandLine,
          blocks: [{ type: "command", name: command.name, args: command.args }],
        };
      }
      const system = parseSystemNoise(message.content);
      if (system) {
        // The searchable text is the summary, not the markup: harness noise
        // should stay findable without a wall of XML becoming a chat's title.
        return {
          messageId,
          role,
          ts,
          text: system.summary,
          blocks: [system],
        };
      }

      const text = message.content;
      return {
        messageId,
        role,
        ts,
        text,
        blocks: [{ type: "text", text }],
        ...model,
      };
    }

    if (Array.isArray(message.content)) {
      const blocks: NormalizedBlock[] = [];
      message.content.forEach((block, index) => {
        const normalized = normalizeBlock(block, messageId, index);
        if (normalized) blocks.push(normalized);
      });
      const text = blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { messageId, role, ts, text, blocks, ...model };
    }

    return null;
  }

  resolveImage(
    ref: string,
    loadPayload: (messageId: string) => unknown | null
  ): { mediaType: string; bytes: Buffer } | null {
    const address = parseImageRef(ref);
    if (!address) return null;

    const record = loadPayload(address.messageId) as Record<
      string,
      unknown
    > | null;
    if (!record || typeof record !== "object") return null;

    const message = record.message as { content?: unknown } | undefined;
    if (!message || !Array.isArray(message.content)) return null;

    const block = message.content[address.index] as
      | Record<string, unknown>
      | undefined;
    if (!block || block.type !== "image") return null;

    const source = block.source as Record<string, unknown> | undefined;
    if (!source || source.type !== "base64") return null;
    const mediaType = String(source.media_type ?? "");
    const data = source.data;
    if (!mediaType || typeof data !== "string") return null;

    return { mediaType, bytes: Buffer.from(data, "base64") };
  }
}

// Stream lines until the first one carrying a cwd. A fixed-size head read
// would miss the cwd when an earlier message embeds a large pasted image,
// pushing every cwd-bearing line past the buffer.
async function readCwdFromJsonl(
  sourcePath: string
): Promise<string | undefined> {
  try {
    const stream = fs.createReadStream(sourcePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        if (!line) continue;
        let obj: { cwd?: unknown };
        try {
          obj = JSON.parse(line) as { cwd?: unknown };
        } catch {
          continue; // Ignore malformed lines.
        }
        if (typeof obj.cwd === "string" && obj.cwd.length > 0) {
          return obj.cwd;
        }
      }
    } finally {
      rl.close();
      stream.destroy();
    }
  } catch {
    // Ignore I/O errors; fall back to undefined project.
  }
  return undefined;
}

// Claude Code records a slash-command invocation as a user message whose text
// is `<command-message>…</command-message>\n<command-name>/tdd</command-name>`
// with an optional `<command-args>…</command-args>`. Translate it here so the
// frontend renders a chip and never sees the markup (ADR-0023).
const COMMAND_NAME_RE = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/;

function parseCommandMarkup(
  content: string
): { name: string; args: string } | null {
  const nameMatch = COMMAND_NAME_RE.exec(content);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();
  const argsMatch = COMMAND_ARGS_RE.exec(content);
  const args = argsMatch ? argsMatch[1].trim() : "";
  return { name, args };
}

// Claude Code injects harness noise as fake user turns. Most of it is flagged
// `isMeta` and already dropped above; what survives is translated here so the
// frontend renders a system row and never sees the markup (ADR-0023).
const TASK_NOTIFICATION_RE = /<task-notification>[\s\S]*<\/task-notification>/;
const TASK_SUMMARY_RE = /<summary>([\s\S]*?)<\/summary>/;
const LOCAL_COMMAND_STDOUT_RE =
  /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/;

// The echo is captured off a terminal, so it still carries SGR styling codes.
// They would render as mojibake in a browser.
// eslint-disable-next-line no-control-regex
const ANSI_SGR_RE = /\u001b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_SGR_RE, "");
}

function parseSystemNoise(
  content: string
): { type: "system"; kind: string; summary: string; detail: string } | null {
  const notification = TASK_NOTIFICATION_RE.exec(content);
  if (notification) {
    const summaryMatch = TASK_SUMMARY_RE.exec(notification[0]);
    return {
      type: "system",
      kind: "task-notification",
      summary: summaryMatch?.[1].trim() || "Task notification",
      detail: notification[0],
    };
  }

  const stdout = LOCAL_COMMAND_STDOUT_RE.exec(content);
  if (stdout) {
    // A local command echo is already one line, so it is wholly the summary and
    // there is nothing left to expand into.
    return {
      type: "system",
      kind: "local-command-stdout",
      summary: stripAnsi(stdout[1]).trim(),
      detail: "",
    };
  }

  return null;
}

// An image's address inside its own message: the message id plus the block's
// position in the Agent's content array. Opaque to everyone but this plugin —
// the endpoint hands it back untouched and the plugin resolves it.
function imageRef(messageId: string, index: number): string {
  return `${messageId}.${index}`;
}

// The inverse of `imageRef`. Splits on the last dot so a message id containing
// dots still round-trips.
function parseImageRef(
  ref: string
): { messageId: string; index: number } | null {
  const dot = ref.lastIndexOf(".");
  if (dot <= 0) return null;
  const index = Number(ref.slice(dot + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { messageId: ref.slice(0, dot), index };
}

// `index` is the block's position in the Agent's own content array, not in the
// normalized output: unrecognized blocks get dropped, so only the raw position
// survives as a stable address back into the Raw row (see `imageRef`).
function normalizeBlock(
  raw: unknown,
  messageId: string,
  index: number
): NormalizedBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  switch (b.type) {
    case "image": {
      const source = b.source as Record<string, unknown> | undefined;
      // Claude Code only writes inline base64 today. A source shape we don't
      // recognize is dropped rather than served as a broken image.
      if (!source || source.type !== "base64") return null;
      const mediaType = String(source.media_type ?? "");
      if (!mediaType) return null;
      return { type: "image", mediaType, ref: imageRef(messageId, index) };
    }
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
        // Only carried when the tool actually failed: a `false` on every
        // successful result would grow the stored block for nothing.
        ...(b.is_error === true ? { isError: true } : {}),
      };
    default:
      return null;
  }
}
