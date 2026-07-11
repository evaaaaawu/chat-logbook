import { ChevronUp, ChevronDown } from "lucide-react";
import type { ScrollPillTarget } from "@/conversation/scrollPillVisibility";
import { ActionTooltip } from "@/shared/ActionTooltip";
import { modifierHint } from "@/shared/platform";

interface ScrollPillProps {
  target: ScrollPillTarget;
  onJumpTop: () => void;
  onJumpBottom: () => void;
  /**
   * New messages arrived below the current viewport while scrolled up (issue
   * #189). Only meaningful for the down ("jump to bottom") direction; it marks
   * the pill so the reader knows there is live content without being yanked
   * down. Ignored once pinned at the bottom, where the pill points up.
   */
  hasNewBelow?: boolean;
}

/**
 * Floating navigation for long conversations: a single round button tucked into
 * the pane's bottom-right corner (over the margin, clear of the reading column).
 * It shows one contextual direction — "back to top" once pinned at the bottom,
 * otherwise "jump to latest" — matching the single scroll button in Slack /
 * Discord / ChatGPT. Positioned absolutely against the (non-scrolling) pane
 * wrapper, it stays put while the conversation scrolls beneath it.
 *
 * When live messages land below a scrolled-up reader, the down control grows a
 * small accent dot and its label gains "(new messages)" — the state rides the
 * label, not color alone, so it is conveyed to assistive tech (issue #189).
 */
export function ScrollPill({
  target,
  onJumpTop,
  onJumpBottom,
  hasNewBelow = false,
}: ScrollPillProps) {
  if (target === null) return null;

  const isTop = target === "top";
  const Icon = isTop ? ChevronUp : ChevronDown;
  const showNew = !isTop && hasNewBelow;
  const label = isTop
    ? "Jump to top"
    : showNew
      ? "Jump to bottom (new messages)"
      : "Jump to bottom";
  const hint = modifierHint(isTop ? "↑" : "↓");

  return (
    <div className="absolute bottom-6 right-6 z-10">
      <span className="group/action relative">
        <button
          type="button"
          aria-label={label}
          onClick={isTop ? onJumpTop : onJumpBottom}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Icon size={18} aria-hidden="true" />
          {showNew && (
            <span
              data-testid="scroll-pill-new-dot"
              aria-hidden="true"
              // A 2px ring in the pane background punches the dot out of the
              // pill's edge; it scales in so arrival is felt, not jarring — the
              // pill itself never moves or resizes.
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background animate-in zoom-in-50 fade-in duration-150"
            />
          )}
        </button>
        <ActionTooltip label={label} hint={hint} />
      </span>
    </div>
  );
}
