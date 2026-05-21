const AGENT_DISPLAY_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
};

export function getAgentDisplayName(agent: string): string {
  return AGENT_DISPLAY_NAMES[agent] ?? agent;
}
