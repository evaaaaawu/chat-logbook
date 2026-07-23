import { Terminal } from "lucide-react";
import type { ContentBlock } from "@/types";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";
import { DiffView } from "@/conversation/DiffView";
import { generateToolSummary } from "@/conversation/generateToolSummary";
import type { ToolResultBlock } from "@/conversation/toolUnits";

type ToolUseBlock = Extract<ContentBlock, { type: "tool_use" }>;

interface CollapsibleToolCallProps {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  isExpanded: boolean;
  onToggle: () => void;
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
  isExpanded,
  onToggle,
}: CollapsibleToolCallProps) {
  // A file-editing result carries the patch and the path it applied to (#235).
  // The diff is the whole point of expanding such a unit, so it stands in for
  // both raw blocks — the call's own old/new strings would only repeat it.
  const patch = result?.patch;
  const isDiff = Boolean(result?.file_path && patch && patch.length > 0);

  return (
    <CollapsibleRow
      icon={Terminal}
      summary={generateToolSummary(block, result)}
      hasError={result?.is_error}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      {isDiff ? (
        <DiffView filePath={result!.file_path!} patch={patch!} />
      ) : (
        <>
          <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-xs text-muted-foreground">
            {JSON.stringify(block.input, null, 2)}
          </pre>
          {result && (
            <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-xs text-muted-foreground">
              {formatResultContent(result.content)}
            </pre>
          )}
        </>
      )}
    </CollapsibleRow>
  );
}
