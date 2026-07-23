import { Layers } from "lucide-react";
import { CollapsibleRow } from "@/conversation/CollapsibleRow";

interface FoldSummaryRowProps {
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * The one row a folded stretch of Tool units collapses to (#199).
 *
 * It carries no detail of its own: opening it puts the units back on screen,
 * each still opening independently, and those units belong to the turns that
 * recorded them rather than to this row.
 */
export function FoldSummaryRow({
  summary,
  isExpanded,
  onToggle,
}: FoldSummaryRowProps) {
  return (
    <CollapsibleRow
      icon={Layers}
      summary={summary}
      isExpanded={isExpanded}
      onToggle={onToggle}
      isExpandable
      isSummary
    />
  );
}
