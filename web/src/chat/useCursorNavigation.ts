import { useEffect, useRef, useState } from "react";
import type { Chat } from "@/types";

interface UseCursorNavigationParams {
  /** The ordered chats the Cursor walks through; drives index <-> id mapping. */
  chats: Chat[];
  /** The current Open Chat id; the Cursor starts from — and re-anchors to — it. */
  openId: string | null;
  /** Called (debounced) when a keyboard move lands the Cursor on a row. */
  onOpen: (id: string) => void;
  /** Debounce window before a landed Cursor opens its Chat. */
  debounceMs?: number;
}

interface CursorNavigation {
  /** The id of the row the Cursor rests on, or null before the first move. */
  cursorId: string | null;
  /** The index of the Cursor row, or -1 before the first move. */
  cursorIndex: number;
}

/**
 * The Cursor: the keyboard-focused row that ArrowUp/ArrowDown move through the
 * chat list. Distinct from the Open Chat and the Selection (see CONTEXT.md). A
 * plain arrow also opens the landed Chat, debounced so holding or rapidly
 * pressing the arrows fetches once, not once per row.
 *
 * Keyboard and mouse stay in sync: when the Open Chat changes on its own — a
 * mouse click on a row — the Cursor re-anchors to it, so the next arrow
 * continues from where the mouse left off, not a stale position. That sync
 * never re-opens the Chat (only a keyboard move does), so a click costs one
 * fetch, not two.
 */
export function useCursorNavigation({
  chats,
  openId,
  onOpen,
  debounceMs = 150,
}: UseCursorNavigationParams): CursorNavigation {
  const [cursorIndex, setCursorIndex] = useState(-1);

  // Re-anchor the Cursor to the Open Chat whenever it changes externally (a
  // mouse click on a row). Adjusting state during render on a prop change is the
  // sanctioned React pattern and beats an effect: no extra paint, no stale tick.
  const [lastOpenId, setLastOpenId] = useState(openId);
  if (openId !== lastOpenId) {
    setLastOpenId(openId);
    setCursorIndex(chats.findIndex((chat) => chat.id === openId));
  }

  // Mirror the latest cursorIndex and onOpen into refs so the keydown handler
  // reads current values without re-subscribing the window listener each render.
  const cursorIndexRef = useRef(cursorIndex);
  useEffect(() => {
    cursorIndexRef.current = cursorIndex;
  }, [cursorIndex]);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      // Only bare arrows walk the Cursor. A modifier makes it a different
      // shortcut — Cmd/Ctrl+Arrow is the conversation's jump-to-top/bottom
      // (see useScrollShortcuts) — so leave those alone or the same keypress
      // moves the list Cursor and jumps the conversation at once.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Typing in a title field owns its own arrows; never hijack them.
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      // Keystrokes inside an open popover (find-or-create, recolor, metadata…)
      // belong to that popover, not the Cursor.
      if (
        target instanceof Element &&
        target.closest('[data-slot="popover-content"]')
      )
        return;

      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const current = cursorIndexRef.current;
      const start =
        current >= 0 ? current : chats.findIndex((chat) => chat.id === openId);
      // Clamp within the list so the Cursor never runs off either end.
      const next = Math.max(0, Math.min(start + delta, chats.length - 1));
      // A move against the end is a no-op: don't churn state or re-open.
      if (next === current) return;

      cursorIndexRef.current = next;
      setCursorIndex(next);

      // Debounce the open so holding or rapidly pressing the arrows fetches
      // once, for the row the Cursor finally rests on, not once per row.
      const landedId = chats[next]?.id;
      if (!landedId) return;
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      openTimerRef.current = setTimeout(() => {
        onOpenRef.current(landedId);
      }, debounceMs);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chats, openId, debounceMs]);

  useEffect(
    () => () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    },
    []
  );

  const cursorId = cursorIndex >= 0 ? (chats[cursorIndex]?.id ?? null) : null;
  return { cursorId, cursorIndex };
}
