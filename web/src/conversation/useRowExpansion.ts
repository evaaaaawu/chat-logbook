import { useCallback, useMemo, useState } from "react";

/** Whether each skim-layer row is open, and how to flip one. */
export interface RowExpansion {
  isExpanded: (messageId: string, blockIndex: number) => boolean;
  toggle: (messageId: string, blockIndex: number) => void;
}

function key(messageId: string, blockIndex: number): string {
  return `${messageId}:${blockIndex}`;
}

/**
 * Which rows the reader has opened in this Chat, held above the rows themselves.
 *
 * Kept per chat rather than per row because the virtualizer keys rows by list
 * position: a row scrolled out of view, or a message arriving above one, hands
 * the row's component instance to different content, and state living in that
 * instance would silently follow the position instead of the row (#236). Keyed
 * by message id and block index, the two things that actually identify a row.
 */
export function useRowExpansion(chatId: string | undefined): RowExpansion {
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());
  // A different chat is a different set of rows, so nothing carries over.
  const [seenChatId, setSeenChatId] = useState(chatId);
  if (seenChatId !== chatId) {
    setSeenChatId(chatId);
    setOpenRows(new Set());
  }

  const isExpanded = useCallback(
    (messageId: string, blockIndex: number) =>
      openRows.has(key(messageId, blockIndex)),
    [openRows]
  );
  const toggle = useCallback((messageId: string, blockIndex: number) => {
    setOpenRows((current) => {
      const next = new Set(current);
      const rowKey = key(messageId, blockIndex);
      if (!next.delete(rowKey)) next.add(rowKey);
      return next;
    });
  }, []);

  return useMemo(() => ({ isExpanded, toggle }), [isExpanded, toggle]);
}
