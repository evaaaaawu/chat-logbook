import { ClaudeCodePlugin } from "./claude-code/plugin.js";
import type { AgentPlugin } from "./types.js";

export const plugins: readonly AgentPlugin[] = [new ClaudeCodePlugin()];
