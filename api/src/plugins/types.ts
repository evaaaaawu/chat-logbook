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

import type { NormalizedBlock } from "./blocks.js";

export type {
  Action,
  ActionKind,
  ActionObject,
  NormalizedBlock,
  PatchHunk,
  StoredBlock,
} from "./blocks.js";

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
  /**
   * The reasoning effort the Agent recorded for this message (e.g. `medium`),
   * per ADR-0023. Carried raw — the Agent's own wording, not a mapped label.
   * Absent when the Agent recorded none.
   */
  effort?: string;
}

export interface AgentPlugin {
  id: string;
  displayName: string;
  discover(env: PluginEnv): AsyncIterable<ChatRef>;
  extractRaw(ref: ChatRef): AsyncIterable<RawRecord>;
  normalize(raw: RawRecord): NormalizedMessage | null;
  /**
   * Resolve an `image` block's `ref` back to the bytes the Agent wrote into Raw.
   * The ref is the plugin's own token — only the plugin that minted it knows
   * which message it addresses — so the endpoint hands it back untouched along
   * with `loadPayload`, which fetches one message's Raw payload by message id.
   * Keeping the lookup behind a callback keeps ref parsing wholly in the plugin
   * and store access wholly in the endpoint. Returns null when the ref names
   * nothing. Optional: an Agent whose logs carry no images never implements it.
   */
  resolveImage?(
    ref: string,
    loadPayload: (messageId: string) => unknown | null
  ): {
    mediaType: string;
    bytes: Buffer;
    /**
     * True when the bytes were rendered here rather than copied out of Raw — a
     * visualize widget, whose theme and sizing this code injects at request
     * time. Those bytes are a function of the app's version, not the archive's
     * content, so they must stay revalidatable: an upgrade that changes the
     * rendering has to reach browsers that already hold the old one. Absent for
     * verbatim bytes, which never change and are cached forever.
     */
    rendered?: boolean;
  } | null;
}
