import { ArrowDown } from "lucide-react";

interface NewMessagesPillProps {
  /** Whether unseen messages are waiting below the current viewport. */
  visible: boolean;
  /** Jump to the unread divider (the first message the reader has not seen). */
  onClick: () => void;
}

/**
 * A bottom-center pill announcing live messages that arrived while the reader
 * was scrolled up (issue #189). Distinct from the corner ScrollPill: this is an
 * event notice, not navigation, so it sits center-bottom (the Slack / Discord
 * convention) and appears only when there is unseen content. Clicking it jumps
 * to the unread divider — the start of what's new — not the very bottom, so a
 * long run of new messages is read from its beginning.
 */
export function NewMessagesPill({ visible, onClick }: NewMessagesPillProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowDown size={15} aria-hidden="true" />
        New messages
      </button>
    </div>
  );
}
