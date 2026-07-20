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
  | {
      type: "tool_result";
      toolUseId: string;
      content: unknown;
      /**
       * Set when the tool reported a failure. Omitted on success, so the flag
       * only ever widens a stored block (ADR-0023).
       */
      isError?: boolean;
    }
  // A slash-command invocation, translated from the Agent's private markup at
  // normalize time so the frontend never parses it (ADR-0023). Renders as a chip.
  | { type: "command"; name: string; args: string }
  // Harness noise addressed to the Agent rather than written by the reader —
  // task notifications, local command echoes. `kind` is an open string so a new
  // noise type widens the data, not the type union (ADR-0023). `summary` is the
  // collapsed one-liner; `detail` is the original content, kept for expansion.
  | { type: "system"; kind: string; summary: string; detail: string };

export interface NormalizedMessage {
  messageId: string;
  role: "user" | "assistant";
  ts: string;
  text: string;
  blocks: NormalizedBlock[];
  /**
   * The model id the Agent recorded on this message (e.g. `claude-opus-4-8`),
   * per ADR-0023. Absent when the Agent doesn't record one — reader turns never
   * carry one, and a chat that switches models mid-way records the switch
   * message by message.
   */
  model?: string;
}

export interface AgentPlugin {
  id: string;
  displayName: string;
  discover(env: PluginEnv): AsyncIterable<ChatRef>;
  extractRaw(ref: ChatRef): AsyncIterable<RawRecord>;
  normalize(raw: RawRecord): NormalizedMessage | null;
}
