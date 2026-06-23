import type { Tag } from "@/types";
import { TagChip } from "@/tags/TagChip";
import { sortTagsByName } from "@/tags/sortTags";

interface TagChipListProps {
  tags: Tag[];
  // How many name chips to show before collapsing the rest into "+N". The chat
  // list column is narrow, so this caps row height predictably.
  max?: number;
}

// Read-only Tag chips for the chat list's third line — same solid pills as the
// conversation header, names shown directly (no remove affordance here).
export function TagChipList({ tags, max = 3 }: TagChipListProps) {
  if (tags.length === 0) return null;
  const sorted = sortTagsByName(tags);
  const shown = sorted.slice(0, max);
  const overflow = sorted.slice(max);
  return (
    <span
      data-testid="tag-chip-list"
      className="flex items-center gap-1 overflow-hidden"
    >
      {shown.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      {overflow.length > 0 && (
        <span
          title={overflow.map((t) => t.name).join(", ")}
          className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
        >
          +{overflow.length}
        </span>
      )}
    </span>
  );
}
