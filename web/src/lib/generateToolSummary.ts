import type { ContentBlock } from "@/types";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

const MAX_DETAIL_LENGTH = 100;

function truncate(text: string): string {
  if (text.length <= MAX_DETAIL_LENGTH) return text;
  return text.slice(0, MAX_DETAIL_LENGTH) + "…";
}

function getInput(input: unknown): Record<string, unknown> {
  if (typeof input === "object" && input !== null) {
    return input as Record<string, unknown>;
  }
  return {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function generateToolSummary(block: ToolUseBlock): string {
  const { name } = block;
  const input = getInput(block.input);

  const filePath = getString(input.file_path);
  if (filePath) return `${name}: ${filePath}`;

  const command = getString(input.command);
  if (command) return `${name}: ${truncate(command)}`;

  const pattern = getString(input.pattern);
  if (pattern) return `${name}: ${pattern}`;

  return name;
}
