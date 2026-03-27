export interface Session {
  id: string;
  title: string;
  project: string;
  createdAt: number;
  updatedAt: number;
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
