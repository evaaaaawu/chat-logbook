import { useState } from "react";
import type { ContentBlock } from "@/types";
import { generateToolSummary } from "@/conversation/generateToolSummary";

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
        // text-left overrides the browser's default centring for buttons: a
        // long command or path wraps to a second line, and centred code is
        // unreadable.
        className="inline-block cursor-pointer rounded bg-card px-2 py-1 text-left font-mono text-xs text-chart-3 hover:bg-card/80"
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
