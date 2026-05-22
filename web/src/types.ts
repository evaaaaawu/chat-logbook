export interface Chat {
  id: string;
  chatId: string;
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
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  timestamp: string;
}
