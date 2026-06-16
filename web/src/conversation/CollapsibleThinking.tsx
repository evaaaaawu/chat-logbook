import { useState } from "react";

interface CollapsibleThinkingProps {
  thinking: string;
}

export function CollapsibleThinking({ thinking }: CollapsibleThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="cursor-pointer text-xs italic text-muted-foreground hover:text-muted-foreground/80"
      >
        Thinking...
      </button>
      {isExpanded && (
        <div className="mt-1 rounded bg-card p-2 text-xs italic text-muted-foreground">
          {thinking}
        </div>
      )}
    </div>
  );
}
