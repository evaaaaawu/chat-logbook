import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Seeds this chat's open rows and hears about changes, so reading state can be
 * restored on open and persisted on toggle (#239). */
export interface RowExpansionOptions {
  /** Rows to open when the chat is first shown, from stored reading state. */
  initialOpenRows?: readonly string[];
  /** Called with the full open-row set whenever it changes. */
  onOpenRowsChange?: (openRows: string[]) => void;
}

/** Whether each skim-layer row is open, and how to flip one. */
export interface RowExpansion {
  isExpanded: (messageId: string, blockIndex: number) => boolean;
  toggle: (messageId: string, blockIndex: number) => void;
  /**
   * The same two questions, asked with a row key already in hand. A fold is
   * identified by the key of the unit it is anchored at, and that key travels
   * through the layout rather than being taken apart again (#199).
   */
  isKeyExpanded: (rowKey: string) => boolean;
  toggleKey: (rowKey: string) => void;
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
export function useRowExpansion(
  chatId: string | undefined,
  { initialOpenRows, onOpenRowsChange }: RowExpansionOptions = {}
): RowExpansion {
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(
    () => new Set(initialOpenRows)
  );
  // A different chat is a different set of rows: nothing carries over, and the
  // new chat opens with whatever its reading state remembered (#239).
  const [seenChatId, setSeenChatId] = useState(chatId);
  if (seenChatId !== chatId) {
    setSeenChatId(chatId);
    setOpenRows(new Set(initialOpenRows));
  }

  // Held in a ref so a toggle can report the new set without re-subscribing the
  // callback on every change. Synced in an effect, never during render.
  const onChangeRef = useRef(onOpenRowsChange);
  useEffect(() => {
    onChangeRef.current = onOpenRowsChange;
  });

  const isKeyExpanded = useCallback(
    (rowKey: string) => openRows.has(rowKey),
    [openRows]
  );
  const toggleKey = useCallback((rowKey: string) => {
    setOpenRows((current) => {
      const next = new Set(current);
      if (!next.delete(rowKey)) next.add(rowKey);
      onChangeRef.current?.([...next]);
      return next;
    });
  }, []);

  const isExpanded = useCallback(
    (messageId: string, blockIndex: number) =>
      isKeyExpanded(key(messageId, blockIndex)),
    [isKeyExpanded]
  );
  const toggle = useCallback(
    (messageId: string, blockIndex: number) =>
      toggleKey(key(messageId, blockIndex)),
    [toggleKey]
  );

  return useMemo(
    () => ({ isExpanded, toggle, isKeyExpanded, toggleKey }),
    [isExpanded, toggle, isKeyExpanded, toggleKey]
  );
}
