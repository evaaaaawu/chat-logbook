import { Terminal } from "lucide-react";
import type { ContentBlock } from "@/types";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";
import { DiffView } from "@/conversation/DiffView";
import { FileExcerptView } from "@/conversation/FileExcerptView";
import { generateToolSummary } from "@/conversation/generateToolSummary";
import { JsonView } from "@/conversation/JsonView";
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

function readFilePath(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { file_path: filePath } = input as { file_path?: unknown };
  return typeof filePath === "string" ? filePath : undefined;
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

  // A read's whole value is the file it returned, so it gets the same treatment
  // as an edit: the path, the file's own line numbers, and its code coloured.
  // The path comes from the call — a read result carries only the text (#240).
  // A non-text result (an image the tool returned) has no lines to number and
  // keeps the raw rendering.
  const readPath =
    block.name === "Read" ? readFilePath(block.input) : undefined;
  const isExcerpt = Boolean(
    !isDiff && readPath && typeof result?.content === "string"
  );

  const { label, diffStat } = generateToolSummary(block, result);

  return (
    <CollapsibleRow
      icon={Terminal}
      summary={label}
      diffStat={diffStat}
      hasError={result?.is_error}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      {isDiff ? (
        <DiffView filePath={result!.file_path!} patch={patch!} />
      ) : isExcerpt ? (
        <FileExcerptView
          filePath={readPath!}
          content={result!.content as string}
        />
      ) : (
        <>
          <JsonView value={block.input} />
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
