/**
 * The shapes the API serves, shared by the server and the browser client. The
 * web bundle imports this file directly (via the `@wire` alias) and derives its
 * own types from it, so a field the server starts sending reaches the web types
 * in the same commit. Type-only, and everything it imports must stay free of
 * Node and third-party imports; ESLint enforces both.
 */
import type { PatchHunk, StoredBlock } from "./plugins/blocks.js";
import type { Tag } from "./metadata/tag.js";

export type {
  Action,
  ActionKind,
  ActionObject,
  PatchHunk,
} from "./plugins/blocks.js";
export type { ColorToken } from "./metadata/tag-colors.js";
export type { Tag } from "./metadata/tag.js";

export interface ChatResponse {
  /** Public wire-form chat id (`clog_…`) — the canonical, paste-anywhere handle. */
  id: string;
  /** The originating Agent's source id, surfaced for display only — never a handle. */
  sourceId: string;
  agent: string;
  title: string;
  project: string;
  projectPath: string | null;
  sourceFilePath: string | null;
  createdAt: number;
  updatedAt: number;
  /** Trash time in ms; null while the chat is active. */
  deletedAt: number | null;
  isDeleted?: boolean;
  /** Tags assigned to this chat, batched in one grouped query (ADR-0016). */
  tags: Tag[];
}

/**
 * A block as the messages API serves it: exactly as the Archive holds it
 * (ADR-0023), except a tool result, whose fields are remapped to the wire's
 * snake_case. Derived from `StoredBlock` so a new block kind reaches the API
 * type without a second edit here.
 */
export type ApiContentBlock =
  | Exclude<StoredBlock, { type: "tool_result" }>
  | {
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      /** Set when the tool reported a failure. Absent on success. */
      is_error?: boolean;
      /**
       * The file a file-editing tool applied to, and the diff hunks it produced
       * (ADR-0023). Served together or not at all; absent for every other tool.
       */
      file_path?: string;
      patch?: PatchHunk[];
    };

export interface MessageResponse {
  /**
   * The Normalized `message_id`, unique within a Chat. Served as the Message's
   * stable handle: the conversation pane anchors a Message's DOM node to it
   * (#192) so Spotlight can scroll to an exact Message (#25) without depending
   * on a positional index.
   */
  id: string;
  role: "user" | "assistant";
  content: ApiContentBlock[];
  timestamp: string;
  /**
   * The model id the Agent recorded on this message (ADR-0023), served raw so
   * the frontend owns the id→display-name mapping and an unrecognized id still
   * renders. Absent when no model was recorded.
   */
  model?: string;
  /**
   * The reasoning effort the Agent recorded for this message (ADR-0023), served
   * raw in the Agent's own wording. Absent when no effort was recorded.
   */
  effort?: string;
}
