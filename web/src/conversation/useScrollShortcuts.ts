import { useEffect } from "react";

interface ScrollShortcuts {
  /** Off while no chat is open, so the keys don't fire on an empty pane. */
  enabled: boolean;
  onJumpTop: () => void;
  onJumpBottom: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(input|textarea|select)$/i.test(target.tagName);
}

/**
 * Keyboard jumps for the conversation pane: Cmd/Ctrl+↑/↓ and Home/End land
 * instantly at the first / last message — the macOS "top/bottom of document"
 * convention, reinforcing what the browser would do but routed through the
 * virtualizer's index jump. Ignored while typing in a field so it never steals
 * caret movement or title edits.
 */
export function useScrollShortcuts({
  enabled,
  onJumpTop,
  onJumpBottom,
}: ScrollShortcuts): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const primary = e.metaKey || e.ctrlKey;
      if (primary && e.key === "ArrowDown") {
        e.preventDefault();
        onJumpBottom();
      } else if (primary && e.key === "ArrowUp") {
        e.preventDefault();
        onJumpTop();
      } else if (!primary && !e.altKey && !e.shiftKey && e.key === "End") {
        e.preventDefault();
        onJumpBottom();
      } else if (!primary && !e.altKey && !e.shiftKey && e.key === "Home") {
        e.preventDefault();
        onJumpTop();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onJumpTop, onJumpBottom]);
}
