/**
 * The app's hover tooltip for icon buttons: a dark pill that fades in to the
 * left of its trigger, showing a label and an optional keyboard hint (e.g. `⌫`
 * or `⌘↓`). Purely presentational and `aria-hidden` — the trigger button
 * carries the accessible name. Wrap the trigger and this together in a
 * `group/action relative` element so hover reveals it:
 *
 * ```tsx
 * <span className="group/action relative">
 *   <button aria-label="Move to Trash">…</button>
 *   <ActionTooltip label="Move to Trash" hint="⌫" />
 * </span>
 * ```
 */
export function ActionTooltip({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-full top-1/2 mr-1.5 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-[#0a0a0a] px-2 py-1 text-xs text-card-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover/action:opacity-100"
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
