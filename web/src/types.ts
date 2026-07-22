import type { ColorToken } from "@/tags/palette";

export interface Tag {
  id: string;
  name: string;
  color: ColorToken;
}

export interface Chat {
  /** Public wire-form chat id (`clog_…`) — the canonical handle used for routing. */
  id: string;
  /** The originating Agent's source id, surfaced for display only. */
  sourceId: string;
  agent: string;
  title: string;
  project: string;
  projectPath: string | null;
  sourceFilePath: string | null;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete time in ms; null while the chat is active. */
  deletedAt?: number | null;
  isDeleted?: boolean;
  /** Tags assigned to this chat (batched server-side; see ADR-0016). */
  tags?: Tag[];
}

/** One hunk of a unified diff, served as the Agent recorded it (ADR-0023). */
export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** The hunk's lines, each still carrying its `+`, `-` or space prefix. */
  lines: string[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      /** Set when the tool reported a failure. Absent on success. */
      is_error?: boolean;
      /**
       * The file a file-editing tool applied to, and the diff hunks it produced
       * (ADR-0023). Carried together or not at all — every other tool has
       * neither. The line numbers are the Agent's own, which is why the diff
       * comes from here rather than from the call's old/new strings.
       */
      file_path?: string;
      patch?: PatchHunk[];
    }
  // A slash-command invocation the plugin translated from the Agent's private
  // markup (ADR-0023). Renders as a chip; the frontend never parses markup.
  | { type: "command"; name: string; args: string }
  // Harness noise the plugin classified at normalize time (ADR-0023). Renders as
  // a collapsed system row; `detail` is empty when the summary is the whole of it.
  | { type: "system"; kind: string; summary: string; detail: string }
  // An inline image the plugin recorded at normalize time (ADR-0023). Metadata
  // only: `ref` addresses the bytes, which the image endpoint serves lazily so
  // this payload stays light no matter how many screenshots a chat holds.
  | { type: "image"; mediaType: string; ref: string };

export interface Message {
  /** The Normalized `message_id`, unique within a Chat — the Message's stable handle. */
  id: string;
  role: "user" | "assistant";
  content: string | ContentBlock[];
  timestamp: string;
  /**
   * The model id the Agent recorded on this message, served raw by the API.
   * Per message, not per chat: a chat that switches models mid-way shows the
   * switch. Absent when the Agent recorded none.
   */
  model?: string;
  /**
   * The reasoning effort the Agent recorded for this message, served raw by the
   * API in the Agent's own wording — capitalized at render, never mapped to a
   * different label. Absent when the Agent recorded none.
   */
  effort?: string;
}
