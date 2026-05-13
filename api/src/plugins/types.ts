export interface PluginEnv {
  homeDir: string;
}

export interface SessionRef {
  sessionId: string;
  sourcePath: string;
  watchPaths: string[];
}

export interface RawRecord {
  sessionId: string;
  sourcePath: string;
  sourceLocator: string;
  payload: unknown;
}

export type NormalizedBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: unknown };

export interface CanonicalMessage {
  messageId: string;
  role: "user" | "assistant";
  ts: string;
  text: string;
  blocks: NormalizedBlock[];
}

export interface AgentPlugin {
  id: string;
  displayName: string;
  discover(env: PluginEnv): AsyncIterable<SessionRef>;
  extractRaw(ref: SessionRef): AsyncIterable<RawRecord>;
  normalize(raw: RawRecord): CanonicalMessage | null;
}
