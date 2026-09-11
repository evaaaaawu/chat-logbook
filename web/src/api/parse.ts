/**
 * Parsers for every API response the web app reads, used through `fetchJson`
 * and `readJson` (ADR-0027). The server and the web app ship together, so a
 * body of the wrong shape is a bug rather than a format change: a list that
 * fails its check is rejected whole, and the hook keeps its last-known value.
 * Counts and totals read a missing or mistyped number as zero, as they always
 * have. Messages drop only a block the app does not recognize, so the rest of
 * the Chat still opens.
 */
import type { ProjectCount } from "@/chat/projects/projectFacets";
import type { ChatCounts, TagCount } from "@/chat/useChatCounts";
import { isRecord } from "@/shared/isRecord";
import { isColorToken } from "@/tags/palette";
import type {
  Action,
  ActionKind,
  Chat,
  ContentBlock,
  Message,
  PatchHunk,
  Tag,
} from "@/types";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/** An optional field: absent, or present and passing `check`. */
function optional(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isTag(value: unknown): value is Tag {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.color) &&
    isColorToken(value.color)
  );
}

export function isChat(value: unknown): value is Chat {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.sourceId) &&
    isString(value.agent) &&
    isString(value.title) &&
    isString(value.project) &&
    isStringOrNull(value.projectPath) &&
    isStringOrNull(value.sourceFilePath) &&
    isNumber(value.createdAt) &&
    isNumber(value.updatedAt) &&
    optional(value.deletedAt, (d) => d === null || isNumber(d)) &&
    optional(value.isDeleted, isBoolean) &&
    optional(value.tags, (tags) => isArrayOf(tags, isTag))
  );
}

function isTagCount(value: unknown): value is TagCount {
  return isRecord(value) && isString(value.tagId) && isNumber(value.count);
}

function isProjectCount(value: unknown): value is ProjectCount {
  return (
    isRecord(value) &&
    isString(value.project) &&
    isNumber(value.count) &&
    isNumber(value.lastActiveAt)
  );
}

// Keyed by kind so the compiler checks the set is complete.
const ACTION_KINDS: Record<ActionKind, true> = {
  edit: true,
  write: true,
  read: true,
  search: true,
  execute: true,
  delegate: true,
  other: true,
};

function isAction(value: unknown): value is Action {
  if (!isRecord(value)) return false;
  const { kind, object, detail } = value;
  return (
    isString(kind) &&
    Object.hasOwn(ACTION_KINDS, kind) &&
    optional(
      object,
      (o) =>
        isRecord(o) &&
        (o.type === "path" || o.type === "phrase") &&
        isString(o.value)
    ) &&
    optional(detail, isString)
  );
}

function isPatchHunk(value: unknown): value is PatchHunk {
  return (
    isRecord(value) &&
    isNumber(value.oldStart) &&
    isNumber(value.oldLines) &&
    isNumber(value.newStart) &&
    isNumber(value.newLines) &&
    isArrayOf(value.lines, isString)
  );
}

function isContentBlock(value: unknown): value is ContentBlock {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "text":
      return isString(value.text);
    case "thinking":
      return isString(value.thinking);
    case "tool_use":
      return (
        isString(value.id) &&
        isString(value.name) &&
        optional(value.action, isAction)
      );
    case "tool_result":
      return (
        isString(value.tool_use_id) &&
        optional(value.is_error, isBoolean) &&
        optional(value.file_path, isString) &&
        optional(value.patch, (patch) => isArrayOf(patch, isPatchHunk))
      );
    case "command":
      return isString(value.name) && isString(value.args);
    case "system":
      return (
        isString(value.kind) &&
        isString(value.summary) &&
        isString(value.detail)
      );
    case "image":
      return isString(value.mediaType) && isString(value.ref);
    default:
      return false;
  }
}

function parseMessage(value: unknown): Message | null {
  if (!isRecord(value)) return null;
  const { id, role, timestamp, content, model, effort } = value;
  if (!isString(id) || !isString(timestamp)) return null;
  if (role !== "user" && role !== "assistant") return null;
  const parsedContent = isString(content)
    ? content
    : Array.isArray(content)
      ? content.filter(isContentBlock)
      : null;
  if (parsedContent === null) return null;
  return {
    id,
    role,
    content: parsedContent,
    timestamp,
    ...(isString(model) ? { model } : {}),
    ...(isString(effort) ? { effort } : {}),
  };
}

/** `GET /api/chats?limit=…` — one keyset page. */
export function parsePage(
  body: unknown
): { chats: Chat[]; nextCursor: string | null } | null {
  if (!isRecord(body)) return null;
  const { chats, nextCursor } = body;
  if (!isArrayOf(chats, isChat)) return null;
  return { chats, nextCursor: isString(nextCursor) ? nextCursor : null };
}

/**
 * `GET /api/chats/counts` — a field the server left out reads as empty, as it
 * always has, so a partial body still paints the filter panel.
 */
export function parseChatCounts(body: unknown): ChatCounts | null {
  if (!isRecord(body)) return null;
  const { total, projects, tags, untagged } = body;
  return {
    total: isNumber(total) ? total : 0,
    projects: isArrayOf(projects, isProjectCount) ? projects : [],
    tags: isArrayOf(tags, isTagCount) ? tags : [],
    untagged: isNumber(untagged) ? untagged : 0,
  };
}

/** `GET /api/chats/list-total` — a missing total reads as zero. */
export function parseTotal(body: unknown): number | null {
  if (!isRecord(body)) return null;
  return isNumber(body.total) ? body.total : 0;
}

/** `GET /api/chats/filtered-tag-counts`. */
export function parseTagCounts(body: unknown): TagCount[] | null {
  if (!isRecord(body)) return null;
  const { tags } = body;
  return isArrayOf(tags, isTagCount) ? tags : null;
}

/** `GET /api/tags` — the Tag catalog. */
export function parseTags(body: unknown): Tag[] | null {
  if (!isRecord(body)) return null;
  const { tags } = body;
  return isArrayOf(tags, isTag) ? tags : null;
}

/** `POST /api/tags` — the Tag just created. */
export function parseTag(body: unknown): Tag | null {
  if (!isRecord(body)) return null;
  const { tag } = body;
  return isTag(tag) ? tag : null;
}

function isTagsByChat(value: unknown): value is Record<string, Tag[]> {
  return (
    isRecord(value) &&
    Object.values(value).every((tags) => isArrayOf(tags, isTag))
  );
}

/** `POST /api/chats/batch/tags-by-chat` — Tags keyed by chat id. */
export function parseTagsByChat(body: unknown): Record<string, Tag[]> | null {
  if (!isRecord(body)) return null;
  const { byChat } = body;
  return isTagsByChat(byChat) ? byChat : null;
}

/** `GET /api/chats/:id` — the Chat's Messages. */
export function parseMessages(body: unknown): Message[] | null {
  if (!isRecord(body) || !Array.isArray(body.messages)) return null;
  return body.messages.flatMap((m) => {
    const message = parseMessage(m);
    return message ? [message] : [];
  });
}

/** The `{ error }` body every failing endpoint returns. */
export function parseErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  return isString(body.error) ? body.error : null;
}
