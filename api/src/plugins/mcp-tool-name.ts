/**
 * MCP tool names, which every Agent that speaks MCP shares.
 *
 * A call arrives as `mcp__<server>__<tool>`. That structure belongs to the
 * protocol rather than to any one Agent, so reading it lives here and not in a
 * Plugin — a second Agent with MCP servers gets the same handling for free.
 */

const PREFIX = "mcp__";
const SEPARATOR = "__";

/**
 * The server a tool call came from, in a form worth showing a reader, or null
 * when this is not an MCP tool name.
 *
 * The server is the useful half: in `mcp__Claude_Browser__computer` a reader
 * can use "Claude Browser", while `computer` is that server's own action name
 * and means nothing on its own (#260).
 */
export function mcpServerName(toolName: string): string | null {
  if (!toolName.startsWith(PREFIX)) return null;
  const rest = toolName.slice(PREFIX.length);
  const end = rest.indexOf(SEPARATOR);
  const server = end === -1 ? rest : rest.slice(0, end);
  if (!server) return null;
  // Servers name themselves in identifier case; a reader is not reading code.
  return server.replace(/_/g, " ");
}
