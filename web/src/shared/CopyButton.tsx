import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  /** The exact text placed on the clipboard. */
  value: string;
  /** Names the action for screen readers. Becomes "Copied" while confirming. */
  label: string;
  /** Extra positioning for the surface this button sits on. */
  className?: string;
}

const COPIED_FEEDBACK_MS = 1500;

/**
 * A quiet copy affordance: takes `value` away on click, then confirms for a
 * beat before offering itself again. The confirmation rides on the button's own
 * accessible name, so a screen reader hears the result of the act it just took
 * rather than a separate region it has to go find.
 */
export function CopyButton({ value, label, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setCopied(false),
      COPIED_FEEDBACK_MS
    );
  };

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={handleCopy}
      // Quiet action per ADR-0024: card-foreground at rest, brightening on
      // hover. Hidden until the surface is hovered, but always focusable, so
      // the keyboard reaches it without a pointer.
      className={`flex h-6 w-6 items-center justify-center rounded text-card-foreground opacity-0 transition-opacity hover:bg-white/[0.04] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 ${className}`}
    >
      {copied ? (
        <Check size={13} aria-hidden="true" className="text-chart-5" />
      ) : (
        <Copy size={13} aria-hidden="true" />
      )}
    </button>
  );
}
