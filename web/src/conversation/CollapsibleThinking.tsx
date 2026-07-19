import { Brain } from "lucide-react";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";
import { MarkdownText } from "@/conversation/MarkdownText";

interface CollapsibleThinkingProps {
  thinking: string;
}

export function CollapsibleThinking({ thinking }: CollapsibleThinkingProps) {
  return (
    <CollapsibleRow icon={Brain} summary="Thinking...">
      <div className="overflow-x-auto rounded bg-card p-2 text-xs italic text-muted-foreground">
        <MarkdownText>{thinking}</MarkdownText>
      </div>
    </CollapsibleRow>
  );
}
