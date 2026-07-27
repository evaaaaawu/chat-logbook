import { Terminal } from "lucide-react";
import type { ActionObject, ContentBlock } from "@/types";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";
import { CommandView } from "@/conversation/CommandView";
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

/**
 * The row's one line: what happened, then what it happened to.
 *
 * A path stands on its own — it is already a name. A phrase is text the call
 * supplied, so quoting it keeps `Searched for "npm test"` from reading as if
 * the words were ours. The filename alone for now; #262 gives the row a shape
 * that can show the directory too without ever clipping the name.
 */
function sentence(verb: string, object?: ActionObject): string {
  if (!object) return verb;
  if (object.type === "phrase") return `${verb} "${object.value}"`;
  const slash = object.value.lastIndexOf("/");
  return `${verb} ${slash === -1 ? object.value : object.value.slice(slash + 1)}`;
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
  // A read that named no path fetched something else (a URL reads as a phrase),
  // and a non-text result (an image the tool returned) has no lines to number;
  // both keep the raw rendering.
  const action = block.action;
  const readPath =
    action?.kind === "read" && action.object?.type === "path"
      ? action.object.value
      : undefined;
  const isExcerpt = Boolean(
    !isDiff && readPath && typeof result?.content === "string"
  );

  // An execute is worth expanding for the command it ran and what that command
  // said back, so the command renders as shell and the call's input is not also
  // dumped as JSON above it (#252). The command is the Action's detail, since
  // the row itself is labelled with what the call said it was for (#263).
  const command = action?.kind === "execute" ? action.detail : undefined;

  const { verb, object, diffStat } = generateToolSummary(block, result);

  return (
    <CollapsibleRow
      icon={Terminal}
      summary={sentence(verb, object)}
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
      ) : command !== undefined ? (
        <CommandView
          command={command}
          output={result ? formatResultContent(result.content) : undefined}
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
