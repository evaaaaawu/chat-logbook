import { useLayoutEffect, useRef, useState } from "react";
import type { Tag } from "@/types";
import type { ColorToken } from "@/tags/palette";
import { TagChip } from "@/tags/TagChip";
import { AddTagPopover } from "@/tags/AddTagPopover";
import { sortTagsByName } from "@/tags/sortTags";

interface TagStripProps {
  chatId: string;
  assigned: Tag[];
  allTags: Tag[];
  onAssign: (chatId: string, tagId: string) => void;
  onRemove: (chatId: string, tagId: string) => void;
  onCreate: (
    chatId: string,
    name: string,
    color: ColorToken
  ) => Promise<Tag | null>;
}

const CHIP_GAP = 8;
// Horizontal room kept clear for the "+N" pill and the "+ Tag" button so the
// last fitting chip never collides with them.
const CONTROLS_RESERVE = 120;

// The tag strip below the conversation header (ADR-0015 / issue #10). It lives
// in the content area, not the header band, so the three columns' 48px headers
// stay aligned. Chips render on a single line; any that don't fit collapse into
// a "+N" pill that opens the same find-or-create popover as "+ Tag".
export function TagStrip({
  chatId,
  assigned,
  allTags,
  onAssign,
  onRemove,
  onCreate,
}: TagStripProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(assigned.length);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const recompute = () => {
      // Before layout (and under jsdom) clientWidth is 0 — show every chip
      // rather than collapsing them all into "+N".
      if (row.clientWidth === 0) {
        setVisibleCount(assigned.length);
        return;
      }
      const chipEls = Array.from(measure.children) as HTMLElement[];
      const available = row.clientWidth - CONTROLS_RESERVE;
      let used = 0;
      let count = 0;
      for (const el of chipEls) {
        used += el.offsetWidth + CHIP_GAP;
        if (used <= available) count += 1;
        else break;
      }
      setVisibleCount(Math.max(0, Math.min(assigned.length, count)));
    };
    const observer = new ResizeObserver(recompute);
    observer.observe(row);
    recompute();
    return () => observer.disconnect();
  }, [assigned]);

  const sorted = sortTagsByName(assigned);
  const visible = sorted.slice(0, visibleCount);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div
      data-testid="tag-strip"
      className="relative flex h-10 shrink-0 items-center bg-[#06303b] px-5"
    >
      {/* Off-screen plain copies that mirror each chip's width (the × overlays
          absolutely so it adds none), measured to decide how many fit. Plain
          spans avoid duplicating the chip's test id and remove button. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute -top-96 left-0 flex gap-2 opacity-0"
      >
        {sorted.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            <span className="max-w-[14ch] truncate">{tag.name}</span>
          </span>
        ))}
      </div>

      <div ref={rowRef} className="flex min-w-0 flex-1 items-center gap-2">
        {visible.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={(t) => onRemove(chatId, t.id)}
          />
        ))}
        {hiddenCount > 0 && (
          <AddTagPopover
            assigned={assigned}
            allTags={allTags}
            onAssign={(tagId) => onAssign(chatId, tagId)}
            onRemove={(tagId) => onRemove(chatId, tagId)}
            onCreate={(name, color) => onCreate(chatId, name, color)}
            triggerTestId="tag-overflow"
            triggerAriaLabel={`Show ${hiddenCount} more tags`}
            triggerClassName="flex h-7 shrink-0 items-center rounded-full bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            triggerContent={`+${hiddenCount}`}
          />
        )}
        <AddTagPopover
          assigned={assigned}
          allTags={allTags}
          onAssign={(tagId) => onAssign(chatId, tagId)}
          onRemove={(tagId) => onRemove(chatId, tagId)}
          onCreate={(name, color) => onCreate(chatId, name, color)}
        />
      </div>
    </div>
  );
}
