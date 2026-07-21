import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";

interface InlineImageProps {
  /** The chat the image belongs to; the bytes are served under its id. */
  chatId: string;
  /** The plugin's opaque address for these bytes inside the Raw layer. */
  imageRef: string;
  /** The block's media type, which is all that tells a drawing from a photo. */
  mediaType: string;
}

/**
 * What to call this image where a reader hears it rather than sees it.
 *
 * SVG only reaches the archive as an agent-drawn widget — a diagram or a chart
 * — while every other type got here because someone pasted it.
 */
function imageLabel(mediaType: string): string {
  return mediaType === "image/svg+xml" ? "Diagram" : "Pasted image";
}

/**
 * The URL the image bytes come from. The endpoint caches aggressively — forever
 * for a pasted screenshot, revalidated for a drawing the app renders — so a
 * thumbnail already scrolled past costs little to show again, including at full
 * size in the lightbox.
 */
function inlineImageSrc(chatId: string, imageRef: string): string {
  return `/api/chats/${chatId}/images/${imageRef}`;
}

/**
 * An image in place in the conversation — a pasted screenshot, or a diagram the
 * agent drew.
 *
 * Held to a thumbnail height so an image never shoves the surrounding prose off
 * screen, and loaded only once scrolled into view — a chat can hold dozens, and
 * the messages payload deliberately carries none of their bytes (ADR-0023).
 * Clicking opens it at full size; the lightbox reuses the same URL, so the
 * bytes are already in the browser's cache.
 *
 * A widget's bytes are rendered per request rather than stored, so its URL
 * revalidates instead of being pinned — an upgrade that redraws it reaches a
 * reader who already viewed the old one.
 */
export function InlineImage({ chatId, imageRef, mediaType }: InlineImageProps) {
  const [open, setOpen] = useState(false);
  const src = inlineImageSrc(chatId, imageRef);
  const label = imageLabel(mediaType);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open image full size"
        className="block cursor-zoom-in rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={src}
          alt={label}
          loading="lazy"
          className="my-2 max-h-60 w-auto max-w-full rounded-md border border-border object-contain"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Nearly the whole viewport: the point of opening it is to read what
            the thumbnail was too small for. */}
        <DialogContent className="w-auto max-w-[calc(100vw-4rem)] bg-transparent p-0 shadow-none ring-0">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <img
            src={src}
            alt={label}
            className="max-h-[calc(100vh-4rem)] max-w-full rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
