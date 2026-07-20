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
    }
  // A slash-command invocation the plugin translated from the Agent's private
  // markup (ADR-0023). Renders as a chip; the frontend never parses markup.
  | { type: "command"; name: string; args: string }
  // Harness noise the plugin classified at normalize time (ADR-0023). Renders as
  // a collapsed system row; `detail` is empty when the summary is the whole of it.
  | { type: "system"; kind: string; summary: string; detail: string };

export interface Message {
  /** The Normalized `message_id`, unique within a Chat — the Message's stable handle. */
  id: string;
  role: "user" | "assistant";
  content: string | ContentBlock[];
  timestamp: string;
}
