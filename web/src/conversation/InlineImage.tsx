import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";

interface InlineImageProps {
  /** The chat the image belongs to; the bytes are served under its id. */
  chatId: string;
  /** The plugin's opaque address for these bytes inside the Raw layer. */
  imageRef: string;
}

/**
 * The URL the image bytes come from. Archived bytes never change, so the
 * response is cached forever and a thumbnail already scrolled past costs
 * nothing to show again — including at full size in the lightbox.
 */
export function inlineImageSrc(chatId: string, imageRef: string): string {
  return `/api/chats/${chatId}/images/${imageRef}`;
}

/**
 * A pasted screenshot, in place in the conversation.
 *
 * Held to a thumbnail height so an image never shoves the surrounding prose off
 * screen, and loaded only once scrolled into view — a chat can hold dozens, and
 * the messages payload deliberately carries none of their bytes (ADR-0023).
 * Clicking opens it at full size; the lightbox reuses the same URL, so the
 * bytes are already in the browser's cache.
 */
export function InlineImage({ chatId, imageRef }: InlineImageProps) {
  const [open, setOpen] = useState(false);
  const src = inlineImageSrc(chatId, imageRef);

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
          alt="Pasted image"
          loading="lazy"
          className="my-2 max-h-60 w-auto max-w-full rounded-md border border-border object-contain"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Nearly the whole viewport: the point of opening it is to read what
            the thumbnail was too small for. */}
        <DialogContent className="w-auto max-w-[calc(100vw-4rem)] bg-transparent p-0 shadow-none ring-0">
          <DialogTitle className="sr-only">Pasted image</DialogTitle>
          <img
            src={src}
            alt="Pasted image"
            className="max-h-[calc(100vh-4rem)] max-w-full rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
