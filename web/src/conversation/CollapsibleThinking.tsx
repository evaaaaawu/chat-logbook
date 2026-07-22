import { Brain } from "lucide-react";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";
import { MarkdownText } from "@/conversation/MarkdownText";

interface CollapsibleThinkingProps {
  thinking: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export function CollapsibleThinking({
  thinking,
  isExpanded,
  onToggle,
}: CollapsibleThinkingProps) {
  return (
    <CollapsibleRow
      icon={Brain}
      summary="Thinking..."
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <div className="overflow-x-auto rounded bg-card p-2 text-xs italic text-muted-foreground">
        <MarkdownText>{thinking}</MarkdownText>
      </div>
    </CollapsibleRow>
  );
}
