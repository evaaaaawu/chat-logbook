import { useState } from "react";
import type { ContentBlock } from "@/types";
import { generateToolSummary } from "@/lib/generateToolSummary";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

interface CollapsibleToolCallProps {
  block: ToolUseBlock;
}

export function CollapsibleToolCall({ block }: CollapsibleToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-block cursor-pointer rounded bg-card px-2 py-1 font-mono text-xs text-chart-3 hover:bg-card/80"
      >
        {generateToolSummary(block)}
      </button>
      {isExpanded && (
        <pre className="mt-1 overflow-x-auto rounded bg-card p-2 font-mono text-xs text-muted-foreground">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      )}
    </div>
  );
}
