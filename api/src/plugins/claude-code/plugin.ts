import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type {
  AgentPlugin,
  NormalizedMessage,
  NormalizedBlock,
  PatchHunk,
  PluginEnv,
  RawRecord,
  ChatRef,
} from "../types.js";
import { svgWidgetCode, themeWidgetSvg } from "../visualize-widget.js";

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
    // Effort sits on the record, not inside `message` — Claude Code writes it
    // beside the model rather than in the API payload it echoes back.
    const effort =
      typeof payload.effort === "string" && payload.effort !== ""
        ? { effort: payload.effort }
        : {};

    // The directory the turn ran in, used to resolve relative file mentions.
    const cwd = typeof payload.cwd === "string" ? payload.cwd : undefined;

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

      return {
        messageId,
        role,
        ts,
        text: translateFileMentions(message.content, cwd, asPath),
        blocks: [
          {
            type: "text",
            text: translateFileMentions(message.content, cwd, asLink),
          },
        ],
        ...model,
        ...effort,
      };
    }

    if (Array.isArray(message.content)) {
      const raw = message.content.flatMap((block, index) =>
        normalizeBlock(block, messageId, index, payload.toolUseResult)
      );
      const blocks: NormalizedBlock[] = raw.map((block) =>
        block.type === "text"
          ? { ...block, text: translateFileMentions(block.text, cwd, asLink) }
          : block
      );
      const text = raw
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => translateFileMentions(b.text, cwd, asPath))
        .join("\n");
      return { messageId, role, ts, text, blocks, ...model, ...effort };
    }

    return null;
  }

  resolveImage(
    ref: string,
    loadPayload: (messageId: string) => unknown | null
  ): { mediaType: string; bytes: Buffer; rendered?: boolean } | null {
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
    if (!block) return null;

    // A visualize drawing: the "bytes" are the widget's own source, themed on
    // the way out so its class-based colors resolve outside the harness.
    const widget = svgWidgetCode(block);
    if (widget) {
      return {
        mediaType: "image/svg+xml",
        bytes: Buffer.from(themeWidgetSvg(widget), "utf8"),
        rendered: true,
      };
    }

    if (block.type !== "image") return null;

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

// Claude Code spells a file mention `@path` — agent-private markup carrying
// only a path, never the file's content. Translate it into a standard markdown
// link with a `file://` URL so the frontend has one generic rule (file links
// render as a chip) and never sees the Agent's syntax (ADR-0023).
// The quoted form is what Claude Code writes when the path contains spaces.
const FILE_MENTION_RE = /(^|\s)@(?:"([^"\n]+)"|(\S+))/g;

// Code is quoted, not addressed: an `@path` a reader typed inside a fence or an
// inline span is being shown, not attached, so it stays verbatim.
const CODE_SEGMENT_RE = /```[\s\S]*?```|`[^`\n]*`/g;

// How a matched mention is written back out. A message carries two renderings
// of the same sentence: `asLink` for the blocks the frontend draws chips from,
// `asPath` for `text`, which is the FTS source and the fallback chat title —
// markdown syntax there would leak into the chat list. The `command` block
// splits the same way: a clean line in `text`, the markup in the block.
type MentionWriter = (mentioned: string, cwd: string | undefined) => string;

// The link text keeps the path as the reader wrote it; only the target is
// resolved, so a relative mention still points somewhere on re-reading.
const asLink: MentionWriter = (mentioned, cwd) =>
  `[${mentioned}](${fileUrl(resolveAgainst(mentioned, cwd))})`;

const asPath: MentionWriter = (mentioned) => mentioned;

function translateFileMentions(
  text: string,
  cwd: string | undefined,
  write: MentionWriter
): string {
  let out = "";
  let last = 0;
  for (const code of text.matchAll(CODE_SEGMENT_RE)) {
    out += translateProse(text.slice(last, code.index), cwd, write) + code[0];
    last = code.index + code[0].length;
  }
  return out + translateProse(text.slice(last), cwd, write);
}

function translateProse(
  text: string,
  cwd: string | undefined,
  write: MentionWriter
): string {
  return text.replace(
    FILE_MENTION_RE,
    (match, lead: string, quoted: string | undefined, bare: string) => {
      const mentioned = quoted ?? bare;
      if (!looksLikeFilePath(mentioned)) return match;
      return `${lead}${write(mentioned, cwd)}`;
    }
  );
}

// `~` stays as written: normalize runs without the session's home directory,
// and guessing one would point the link at the wrong machine's user.
function resolveAgainst(mentioned: string, cwd: string | undefined): string {
  if (!cwd) return mentioned;
  if (mentioned.startsWith("/") || mentioned.startsWith("~")) return mentioned;
  return path.posix.join(cwd, mentioned);
}

// `@` is overwhelmingly not a file mention in a developer log — npm scopes
// (`@tanstack/react-virtual`), import aliases (`@/types`), CSS at-rules
// (`@apply`) and handles all share the sigil. A mention has to end in a file
// extension, in a slash for a directory, or be a dotfile — named entirely by
// its leading dot, like `.env`. Anything looser turns every mention of a
// package into a chip.
function looksLikeFilePath(mentioned: string): boolean {
  if (mentioned.endsWith("/")) return true;
  const basename = mentioned.slice(mentioned.lastIndexOf("/") + 1);
  if (/^\.[A-Za-z0-9]/.test(basename)) return true;
  return /^[^.].*\.[A-Za-z0-9]+$/.test(basename);
}

// A markdown link's target ends at the first space or unbalanced paren, so the
// path has to be percent-encoded to survive as one link. The link *text* keeps
// the path verbatim — it is what the reader searches for (FTS reads `text`).
function fileUrl(filePath: string): string {
  return `file://${encodeURI(filePath).replace(/[()]/g, encodeURIComponent)}`;
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
// Usually one block in, one block out — but a visualize widget yields two: the
// tool row plus the drawing it renders to, which is why this returns a list.
function normalizeBlock(
  raw: unknown,
  messageId: string,
  index: number,
  toolUseResult?: unknown
): NormalizedBlock[] {
  const one = normalizeOneBlock(raw, messageId, index, toolUseResult);
  if (!one) return [];
  if (one.type === "tool_use" && svgWidgetCode(raw)) {
    // The tool row stays alongside the image: the drawing is the point, but the
    // reader can still expand the row to read the source that produced it.
    return [
      one,
      {
        type: "image",
        mediaType: "image/svg+xml",
        ref: imageRef(messageId, index),
      },
    ];
  }
  return [one];
}

// Edit, Write and MultiEdit all record the same two things beside the message:
// the file they touched and the unified-diff hunks they produced. Every other
// tool records something else, so the shape itself is the test — no tool-name
// table to keep in step with the Agent.
function editedFile(
  toolUseResult: unknown
): { filePath: string; patch: PatchHunk[] } | Record<string, never> {
  if (!toolUseResult || typeof toolUseResult !== "object") return {};
  const r = toolUseResult as Record<string, unknown>;
  if (typeof r.filePath !== "string" || !r.filePath) return {};
  if (!Array.isArray(r.structuredPatch)) return {};
  const patch = r.structuredPatch.filter(isPatchHunk);
  if (patch.length === 0) return {};
  return { filePath: r.filePath, patch };
}

function isPatchHunk(hunk: unknown): hunk is PatchHunk {
  if (!hunk || typeof hunk !== "object") return false;
  const h = hunk as Record<string, unknown>;
  return (
    typeof h.oldStart === "number" &&
    typeof h.oldLines === "number" &&
    typeof h.newStart === "number" &&
    typeof h.newLines === "number" &&
    Array.isArray(h.lines) &&
    h.lines.every((line) => typeof line === "string")
  );
}

function normalizeOneBlock(
  raw: unknown,
  messageId: string,
  index: number,
  toolUseResult?: unknown
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
        ...editedFile(toolUseResult),
      };
    default:
      return null;
  }
}
