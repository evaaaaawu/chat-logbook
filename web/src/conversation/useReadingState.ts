import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  loadReadingState,
  saveReadingState,
  type ReadingState,
  type ScrollAnchor,
} from "./readingState";

/** Loads a chat's reading state on open and persists changes, debounced. */
export interface ReadingStateController {
  /** What was remembered for this chat, or null on a first visit. */
  initial: ReadingState | null;
  /** Note the current scroll anchor; the write is debounced. */
  recordAnchor: (anchor: ScrollAnchor | null) => void;
  /** Note the current open rows; the write is debounced. */
  recordOpenRows: (openRows: readonly string[]) => void;
  /** Write any pending change immediately (chat change, unmount). */
  flush: () => void;
}

const DEFAULT_DEBOUNCE_MS = 500;

const EMPTY: ReadingState = { anchor: null, openRows: [] };

/**
 * Ties a chat to its browser-stored reading state (#239): loads where the
 * reader left off when the chat opens, and saves the scroll anchor and open
 * rows as they change — debounced, so a scroll or a burst of toggles writes
 * once, and flushed on chat change so switching away never drops the last edit.
 */
export function useReadingState(
  chatId: string | undefined,
  { debounceMs = DEFAULT_DEBOUNCE_MS }: { debounceMs?: number } = {}
): ReadingStateController {
  const initial = useMemo(
    () => (chatId ? loadReadingState(chatId) : null),
    [chatId]
  );

  // The state we would write next, tagged with the chat it belongs to so a
  // pending write always lands on the right chat even as the reader switches.
  // Seeded from what was loaded so an early save (before any scroll) preserves
  // the restored anchor rather than blanking it.
  const latest = useRef<{ chatId: string | undefined; state: ReadingState }>({
    chatId,
    state: initial ?? EMPTY,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const { chatId: id, state } = latest.current;
    if (id) saveReadingState(id, state);
  }, []);

  const schedule = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, debounceMs);
  }, [flush, debounceMs]);

  const recordAnchor = useCallback(
    (anchor: ScrollAnchor | null) => {
      latest.current = {
        chatId: latest.current.chatId,
        state: { ...latest.current.state, anchor },
      };
      schedule();
    },
    [schedule]
  );
  const recordOpenRows = useCallback(
    (openRows: readonly string[]) => {
      latest.current = {
        chatId: latest.current.chatId,
        state: { ...latest.current.state, openRows },
      };
      schedule();
    },
    [schedule]
  );

  // Flush the outgoing chat's pending write when the chat changes or the pane
  // unmounts. Cleanup runs before the adopt-new effect below and reads `latest`
  // while it still holds the outgoing chat, so nothing is lost or misfiled.
  useEffect(() => flush, [chatId, flush]);

  // Adopt the new chat's loaded state as the next write's baseline.
  useEffect(() => {
    latest.current = { chatId, state: initial ?? EMPTY };
  }, [chatId, initial]);

  return useMemo(
    () => ({ initial, recordAnchor, recordOpenRows, flush }),
    [initial, recordAnchor, recordOpenRows, flush]
  );
}
