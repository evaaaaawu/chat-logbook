import { X } from "lucide-react";
import type { Tag } from "@/types";
import { TAG_COLOR_HEX, TAG_TEXT_HEX } from "@/tags/palette";

interface TagChipProps {
  tag: Tag;
  // When given, the chip reveals a remove affordance on hover that calls this.
  onRemove?: (tag: Tag) => void;
}

// A full Tag chip for the conversation header: a solid pill filled with the
// tag's color, text color chosen for contrast (ADR-0015 palette). The remove
// "×" overlays the right edge on hover, so the chip reserves no blank gutter.
export function TagChip({ tag, onRemove }: TagChipProps) {
  const bg = TAG_COLOR_HEX[tag.color];
  const fg = TAG_TEXT_HEX[tag.color];
  return (
    <span
      data-testid="tag-chip"
      data-tag-id={tag.id}
      className="group/chip relative inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span className="max-w-[14ch] truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag ${tag.name}`}
          onClick={() => onRemove(tag)}
          style={{ color: fg }}
          className="absolute right-0.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 opacity-0 transition-opacity hover:bg-black/40 focus-visible:opacity-100 group-hover/chip:opacity-100"
        >
          <X size={11} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
