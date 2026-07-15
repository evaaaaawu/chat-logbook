/**
 * The app's hover tooltip for icon buttons: a dark pill that fades in next to
 * its trigger, showing a label and an optional keyboard hint (e.g. `⌫` or
 * `⌘↓`). Purely presentational and `aria-hidden` — the trigger button carries
 * the accessible name. Wrap the trigger and this together in a
 * `group/action relative` element so hover reveals it:
 *
 * ```tsx
 * <span className="group/action relative">
 *   <button aria-label="Move to Trash">…</button>
 *   <ActionTooltip label="Move to Trash" hint="⌫" />
 * </span>
 * ```
 *
 * `placement` picks which side it grows toward. `left` (the default) suits a
 * row's top-right action cluster; `top` suits buttons pinned near a panel's
 * left edge — e.g. the batch bar — where a left-growing pill would slide under
 * the sidebar (#215).
 */
const PLACEMENT_CLASS = {
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  top: "bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2",
} as const;

export function ActionTooltip({
  label,
  hint,
  placement = "left",
}: {
  label: string;
  hint?: string;
  placement?: keyof typeof PLACEMENT_CLASS;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute ${PLACEMENT_CLASS[placement]} flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-[#0a0a0a] px-2 py-1 text-xs text-card-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover/action:opacity-100`}
    >
      {label}
      {hint && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {hint}
        </span>
      )}
    </span>
  );
}
