/**
 * A separator drawn before the first message the reader has not yet seen
 * (issue #189). It marks where a live session's new messages begin, so on
 * jumping down the reader picks up exactly where they left off — the pattern
 * LINE and Discord use. The accent hairline stays low-saturation so it marks
 * without competing with the messages it sits between.
 */
export function UnreadDivider() {
  return (
    <div
      role="separator"
      aria-label="New messages"
      className="flex items-center gap-2 py-1"
    >
      <span className="h-px flex-1 bg-primary/55" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
        New messages
      </span>
      <span className="h-px flex-1 bg-primary/55" />
    </div>
  );
}
