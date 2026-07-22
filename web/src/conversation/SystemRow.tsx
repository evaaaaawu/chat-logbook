import { Cog } from "lucide-react";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";

interface SystemRowProps {
  /** The one-line collapsed summary the plugin extracted. */
  summary: string;
  /** The original content, revealed on expand. Empty when there is no more. */
  detail: string;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Harness noise — a task notification, a local command echo — as one muted row.
 *
 * The plugin already classified it and pulled out the summary at normalize time,
 * so this only renders it and knows nothing about which Agent produced it
 * (ADR-0023). A gear marks it as machinery rather than something anyone wrote.
 */
export function SystemRow({
  summary,
  detail,
  isExpanded,
  onToggle,
}: SystemRowProps) {
  return (
    // Not a skim-layer row, so it takes no part in a Run and carries its own
    // spacing rather than inheriting a Run container's density (#236).
    <div className="my-1">
      <CollapsibleRow
        icon={Cog}
        summary={summary}
        isExpanded={isExpanded}
        onToggle={onToggle}
      >
        {detail ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
            {detail}
          </pre>
        ) : null}
      </CollapsibleRow>
    </div>
  );
}
