import { Check, File } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const COPIED_FEEDBACK_MS = 1400;

interface FileChipProps {
  /** The full path the mention pointed at, as a `file://` URL. */
  href: string;
}

/**
 * A file the reader attached to a turn, rendered inline in the sentence as a
 * chip: an icon and the basename, which is what identifies the file at a
 * glance. The full path is the tooltip, and clicking copies it.
 *
 * The path is a historical reference, not a live pointer — nothing checks
 * whether the file still exists. Checking would cost a stat per chip and
 * promise a freshness the archive cannot keep. That is also why the chip never
 * navigates: there may be nothing at the other end.
 */
export function FileChip({ href }: FileChipProps) {
  const filePath = decodePath(href);
  const basename = filePath.slice(filePath.lastIndexOf("/") + 1);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The icon carries the confirmation so the chip keeps its width — swapping
  // the basename for "Copied" would reflow the sentence around it. The word is
  // there for screen readers, and for anyone whose eye missed the icon.
  const handleCopy = () => {
    void navigator.clipboard.writeText(filePath);
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
      data-testid="file-chip"
      title={filePath}
      aria-label={`Copy path ${filePath}`}
      onClick={handleCopy}
      // The theme paints every surface token the same shade, so a `bg-muted`
      // chip on a message bubble draws no chip at all. The page background is
      // the one darker value available — it reads as inset against the bubble —
      // and the hairline border keeps the edge legible either way.
      className="mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded border border-muted-foreground/30 bg-background px-1.5 py-0.5 align-baseline text-[0.875em] leading-tight text-foreground no-underline hover:border-muted-foreground/60"
    >
      {copied ? (
        <Check
          aria-hidden="true"
          className="size-[1em] shrink-0 self-center text-chart-5"
        />
      ) : (
        <File aria-hidden="true" className="size-[1em] shrink-0 self-center" />
      )}
      <span className="truncate">{basename}</span>
      {copied && (
        <span className="sr-only" aria-live="polite">
          Copied
        </span>
      )}
    </button>
  );
}

function decodePath(href: string): string {
  const raw = href.slice("file://".length);
  try {
    return decodeURI(raw);
  } catch {
    return raw; // A malformed escape is shown as written rather than dropped.
  }
}
