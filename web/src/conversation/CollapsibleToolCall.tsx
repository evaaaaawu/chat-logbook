import { Terminal } from "lucide-react";
import type { ContentBlock } from "@/types";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";
import { generateToolSummary } from "@/conversation/generateToolSummary";
import type { ToolResultBlock } from "@/conversation/toolUnits";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

interface CollapsibleToolCallProps {
  block: ToolUseBlock;
  result?: ToolResultBlock;
}

function formatResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

/**
 * A tool call and the result it produced, as one unit.
 *
 * The result is passed in rather than read from the call's own turn: an Agent
 * commonly records it in the next turn (#193).
 */
export function CollapsibleToolCall({
  block,
  result,
}: CollapsibleToolCallProps) {
  return (
    <CollapsibleRow
      icon={Terminal}
      summary={generateToolSummary(block, result)}
      hasError={result?.is_error}
    >
      <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-xs text-muted-foreground">
        {JSON.stringify(block.input, null, 2)}
      </pre>
      {result && (
        <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-xs text-muted-foreground">
          {formatResultContent(result.content)}
        </pre>
      )}
    </CollapsibleRow>
  );
}
