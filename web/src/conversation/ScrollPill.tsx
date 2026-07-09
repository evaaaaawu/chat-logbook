import { ChevronUp, ChevronDown } from "lucide-react";
import type { ScrollPillTarget } from "@/conversation/scrollPillVisibility";
import { ActionTooltip } from "@/shared/ActionTooltip";
import { modifierHint } from "@/shared/platform";

interface ScrollPillProps {
  target: ScrollPillTarget;
  onJumpTop: () => void;
  onJumpBottom: () => void;
}

/**
 * Floating navigation for long conversations: a single round button tucked into
 * the pane's bottom-right corner (over the margin, clear of the reading column).
 * It shows one contextual direction — "back to top" once pinned at the bottom,
 * otherwise "jump to latest" — matching the single scroll button in Slack /
 * Discord / ChatGPT. Positioned absolutely against the (non-scrolling) pane
 * wrapper, it stays put while the conversation scrolls beneath it.
 */
export function ScrollPill({
  target,
  onJumpTop,
  onJumpBottom,
}: ScrollPillProps) {
  if (target === null) return null;

  const isTop = target === "top";
  const Icon = isTop ? ChevronUp : ChevronDown;
  const label = isTop ? "Jump to top" : "Jump to bottom";
  const hint = modifierHint(isTop ? "↑" : "↓");

  return (
    <div className="absolute bottom-6 right-6 z-10">
      <span className="group/action relative">
        <button
          type="button"
          aria-label={label}
          onClick={isTop ? onJumpTop : onJumpBottom}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Icon size={18} aria-hidden="true" />
        </button>
        <ActionTooltip label={label} hint={hint} />
      </span>
    </div>
  );
}
