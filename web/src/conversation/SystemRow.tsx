import { Cog } from "lucide-react";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";

interface SystemRowProps {
  /** The one-line collapsed summary the plugin extracted. */
  summary: string;
  /** The original content, revealed on expand. Empty when there is no more. */
  detail: string;
}

/**
 * Harness noise — a task notification, a local command echo — as one muted row.
 *
 * The plugin already classified it and pulled out the summary at normalize time,
 * so this only renders it and knows nothing about which Agent produced it
 * (ADR-0023). A gear marks it as machinery rather than something anyone wrote.
 */
export function SystemRow({ summary, detail }: SystemRowProps) {
  return (
    <CollapsibleRow icon={Cog} summary={summary}>
      {detail ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
          {detail}
        </pre>
      ) : null}
    </CollapsibleRow>
  );
}
