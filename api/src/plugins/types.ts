export interface PluginEnv {
  homeDir: string;
}

export interface ChatRef {
  sourceId: string;
  sourcePath: string;
  watchPaths: string[];
  project?: string;
  projectPath?: string;
}

export interface RawRecord {
  sourceId: string;
  sourcePath: string;
  sourceLocator: string;
  payload: unknown;
}

export type NormalizedBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: unknown };

export interface NormalizedMessage {
  messageId: string;
  role: "user" | "assistant";
  ts: string;
  text: string;
  blocks: NormalizedBlock[];
}

export interface AgentPlugin {
  id: string;
  displayName: string;
  discover(env: PluginEnv): AsyncIterable<ChatRef>;
  extractRaw(ref: ChatRef): AsyncIterable<RawRecord>;
  normalize(raw: RawRecord): NormalizedMessage | null;
}
