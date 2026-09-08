import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getScrollPillTarget,
  type ScrollPillTarget,
} from "@/conversation/scrollPillVisibility";
import {
  pickAnchor,
  resolveAnchorIndex,
  resolveMessageIndex,
} from "@/conversation/scrollAnchor";
import type { ScrollSurface } from "@/conversation/scrollSurface";
import type { ReadingStateController } from "@/conversation/useReadingState";

/**
 * What the Reading position needs of a rendered Message: its Normalized id.
 * Both positions this module holds — the scroll spot and the Unread divider —
 * are anchored to that id rather than to a place in the list, and resolved to
 * an index only at render (ADR-0026).
 */
export interface RenderedMessage {
  id: string;
}

/** Where the Unread divider sits, and whether its pill is still worth offering. */
export interface UnreadMark {
  /**
   * Where the first Message the reader has not seen currently sits, resolved
   * from the Message the divider is anchored to; null = caught up, or that
   * Message no longer renders.
   */
  dividerIndex: number | null;
  /** Whether the "new messages" pill should show — hidden once acted on. */
  pillVisible: boolean;
  /** Jump to the divider, which also consumes the pill. */
  onJump: () => void;
}

/** Everything the conversation pane draws from the Reading position, and nothing else. */
export interface ReadingPosition {
  scrollPill: ScrollPillTarget;
  unread: UnreadMark;
  onScroll: () => void;
  onJumpTop: () => void;
  onJumpBottom: () => void;
}

export interface ReadingPositionInput {
  /** The open Chat, or undefined when the pane has none. */
  chatId: string | undefined;
  /** The Messages actually rendered, already filtered of turns that draw nothing. */
  messages: readonly RenderedMessage[];
  /**
   * Whether this Chat's Messages are still in flight. While true, `messages`
   * may still hold the previously open Chat's turns, so landing and restore
   * wait until it settles (#239).
   */
  loading: boolean;
  /**
   * The virtualized column's total height. Not read for its value — it is the
   * signal that the column grew or shrank (a row opening or closing), which
   * moves the pill without a scroll event.
   */
  contentHeight: number;
  /** Where the reader left this Chat last visit, and where to write it back. */
  reading: ReadingStateController;
  /** The scrollable column, as the only way this module touches the scroll. */
  surface: ScrollSurface;
}

/**
 * What arrived since the last run: nothing, or the first Message the reader has
 * not been shown yet.
 *
 * Judged by which Messages are on screen, never by how many. The rendered list
 * drops turns that draw nothing, so its length moves on its own — one Message
 * arriving as an earlier one stops rendering leaves the count exactly where it
 * was, and counting concludes that nothing came (#271).
 */
type Arrival =
  | { appended: false }
  | { appended: true; firstUnseen: RenderedMessage };

function readArrival({
  seen,
  messages,
}: {
  seen: ReadonlySet<string>;
  messages: readonly RenderedMessage[];
}): Arrival {
  const last = messages[messages.length - 1];
  // Nothing new at the end of the column: it is empty, or its last Message is
  // one the reader has already been shown — a re-read that lost turns, or that
  // brought them back in another order. Neither is an arrival.
  if (!last || seen.has(last.id)) return { appended: false };
  // A single read can bring several Messages, and the divider marks the start
  // of the batch rather than its end.
  const firstUnseen = messages.find((message) => !seen.has(message.id)) ?? last;
  return { appended: true, firstUnseen };
}

/**
 * The unread mark as the module holds it, before the pane is told about it.
 * The divider is the Message it sits in front of, not a place in the list: an
 * index is correct the moment it is written and silently wrong afterwards,
 * because an earlier turn starting or stopping rendering shifts everything
 * beneath it (ADR-0026).
 */
interface UnreadState {
  dividerMessageId: string | null;
  consumed: boolean;
}

const CAUGHT_UP: UnreadState = { dividerMessageId: null, consumed: false };

/**
 * Reaching the bottom with a divider present is the reader acting on the batch,
 * the same as tapping the pill. Written as a transition so it can be applied
 * without reading the current value during render.
 */
function consume(current: UnreadState): UnreadState {
  if (current.dividerMessageId === null || current.consumed) return current;
  return { ...current, consumed: true };
}

/**
 * The Reading position: where you are inside the open Chat — the spot you
 * scrolled to, the Unread divider, and which way the scroll pill points.
 *
 * Held only while the Chat is open and rebuilt from Reading state when you come
 * back to it, so persistence stays with `useReadingState`, which this module
 * takes as a dependency rather than swallowing (the row-expansion hook shares
 * it). Everything else — whether the pill has been dismissed, whether the
 * reader is pinned to the bottom, which Chat has been landed on, how many
 * Messages there were last time — is internal, and the pane sees only what it
 * draws (#270).
 */
export function useReadingPosition({
  chatId,
  messages,
  loading,
  contentHeight,
  reading,
  surface,
}: ReadingPositionInput): ReadingPosition {
  // Which direction the scroll pill offers. Kept in state (rather than read
  // during render) so it survives scroll events, jumps, and content that grows
  // or shrinks as Messages expand and collapse. Defaults to hidden until the first
  // measurement, so the pill never flashes on mount.
  const [pillTarget, setPillTarget] = useState<ScrollPillTarget>(null);
  // The unread mark, held as one value because its two halves only ever change
  // together: where the divider sits (the first Message that arrived while the
  // reader was scrolled up, #189 — null means caught up, and it is set once per
  // Chat then frozen), and whether the reader has already acted on the batch.
  // Acting hides the "new messages" pill without touching the divider, which
  // stays until the Chat changes (the LINE pattern).
  const [unreadState, setUnreadState] = useState<UnreadState>(CAUGHT_UP);
  // The unread mark belongs to the Chat that is open, so it clears as the Chat
  // changes. Done here rather than in the landing effect below — React's own
  // pattern for adjusting state when a prop changes — so the divider is gone in
  // the same render the new Chat arrives in, with no flash of the old one's.
  const [markedChat, setMarkedChat] = useState(chatId);
  if (markedChat !== chatId) {
    setMarkedChat(chatId);
    setUnreadState(CAUGHT_UP);
  }
  // Whether the reader is pinned to the bottom, as the arrival effect needs it
  // without re-subscribing every time the viewport moves. Written from the
  // measurement below, never during render.
  const atBottomRef = useRef(true);

  const measurePill = useCallback(() => {
    const viewport = surface.getViewport();
    if (!viewport) return;
    const target = getScrollPillTarget(viewport);
    setPillTarget(target);
    // "top" (or too-short-to-scroll) means the latest Message is in view, so the
    // reader is caught up: reaching the bottom with a divider present consumes
    // the pending "new messages" pill.
    const atBottom = target === "top" || target === null;
    atBottomRef.current = atBottom;
    if (atBottom) setUnreadState(consume);
  }, [surface]);

  // Note where the reader is, as a Message anchor rather than a pixel offset, so
  // reopening restores this spot even after estimated heights settle or the
  // Chat gains and loses Messages (#239). Read from the rendered rows only, so
  // it stays cheap on a long Chat.
  const captureAnchor = useCallback(() => {
    const viewport = surface.getViewport();
    if (!viewport) return;
    const entries = surface
      .getVirtualItems()
      .map((item) => ({
        messageId: messages[item.index]?.id ?? "",
        start: item.start,
      }))
      .filter((entry) => entry.messageId);
    reading.recordAnchor(
      pickAnchor({ scrollTop: viewport.scrollTop, entries })
    );
  }, [surface, messages, reading]);

  const onScroll = useCallback(() => {
    measurePill();
    captureAnchor();
  }, [measurePill, captureAnchor]);

  const onJumpTop = useCallback(() => {
    // Instant index jump, not a smooth scroll: smooth-scrolling across
    // thousands of virtualized rows is slow and janky.
    surface.scrollToIndex(0, { align: "start" });
  }, [surface]);

  const messageCount = messages.length;
  const onJumpBottom = useCallback(() => {
    surface.scrollToIndex(messageCount - 1, { align: "end" });
  }, [surface, messageCount]);

  // The "new messages" pill jumps to the divider — the start of what's new —
  // not the very bottom, so a long run of new Messages reads from its
  // beginning. Acting on the pill consumes it; the divider stays.
  // The stored Message resolved to a place in the list, here rather than in the
  // pane: the freeze rule and the resolution of what it froze belong together,
  // and a divider whose Message is gone comes back as no divider rather than as
  // some arbitrary position (ADR-0026).
  const dividerMessageId = unreadState.dividerMessageId;
  const dividerIndex = useMemo(
    () =>
      dividerMessageId === null
        ? null
        : resolveMessageIndex(dividerMessageId, messages),
    [dividerMessageId, messages]
  );
  const onJumpUnread = useCallback(() => {
    if (dividerIndex === null) return;
    surface.scrollToIndex(dividerIndex, { align: "start" });
    setUnreadState(consume);
  }, [surface, dividerIndex]);

  // A scroll that finishes a frame later — the restore nudge, the re-measure
  // after a jump — outlives the effect run that scheduled it. Returning the
  // cancel as that effect's cleanup would drop the frame whenever a dependency
  // changed in between, and the Messages array changes identity on every
  // re-read of the Chat, so the nudge would go missing with nothing to show for
  // it. The frame is cancelled on unmount instead, where it is genuinely moot.
  const pendingFrameRef = useRef<(() => void) | null>(null);
  const scheduleFrame = useCallback(
    (cb: () => void) => {
      pendingFrameRef.current?.();
      pendingFrameRef.current = surface.afterFrame(cb);
    },
    [surface]
  );
  useEffect(() => () => pendingFrameRef.current?.(), []);

  // Landing and restore. This effect keys on the Chat and the loading flag: it
  // runs until it finds a Chat with its own Messages settled, lands once, and
  // then stands down for the rest of the visit. Which Chat it has landed on is
  // its own state, held apart from the arrival baseline below (#270).
  const landedChatRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chatId) {
      landedChatRef.current = null;
      return;
    }
    // Wait for this Chat's own Messages before landing: while the fetch is in
    // flight, `messages` may still be the previously open Chat's turns, and
    // restoring against those would never find this Chat's anchor (#239). An
    // empty list has nothing to land on yet either.
    if (loading || messages.length === 0) return;
    if (landedChatRef.current === chatId) return;

    landedChatRef.current = chatId;

    // Restore the remembered spot when there is one and its anchored Message
    // still exists; otherwise — a first visit, or an anchor whose Message is
    // gone — land at the bottom, the right answer for a fresh read (#239).
    const anchor = reading.initial?.anchor ?? null;
    const anchorIndex = resolveAnchorIndex(anchor, messages);
    if (anchor && anchorIndex !== null) {
      // scrollToIndex re-measures and re-scrolls until the Message lands at the
      // top, which a raw offset cannot do against estimated heights. The
      // within-message offset is a small nudge applied once the row is there.
      surface.scrollToIndex(anchorIndex, { align: "start" });
      scheduleFrame(() => {
        if (anchor.offset) surface.nudgeBy(anchor.offset);
        measurePill();
      });
      return;
    }
    // Open a Chat at the bottom (its latest Messages), matching Claude Code
    // desktop: the most common recall question is "how did this session end?".
    surface.scrollToIndex(messages.length - 1, { align: "end" });
    // Re-measure after the jump settles so the pill reflects the landed
    // position (at the bottom it offers "back to top").
    scheduleFrame(measurePill);
  }, [chatId, loading, messages, reading, surface, measurePill, scheduleFrame]);

  // Live arrival. This effect keys on the Messages, and keeps its own baseline
  // — the Messages the reader has been shown, written on every run, never
  // skipped, so a Chat that empties and refills re-enters with a baseline that
  // matches what is on screen. Sharing one baseline with the landing effect above is what made
  // that go wrong before (#270).
  const arrivalBaselineRef = useRef<{
    chatId: string | undefined;
    seen: ReadonlySet<string>;
  }>({ chatId: undefined, seen: new Set() });
  useEffect(() => {
    const previous = arrivalBaselineRef.current;
    // Only a landed Chat's baseline is worth comparing against, so an un-landed
    // run banks it under no Chat at all. That way the commit the landing effect
    // lands on — where the list swaps from the previous Chat's turns to this
    // one's — can never read as an arrival.
    const landed = landedChatRef.current === chatId;
    // What is on screen now, which serves twice: as the next run's baseline, and
    // as the check below for whether the divider still marks something.
    const onScreen = new Set(messages.map((message) => message.id));
    arrivalBaselineRef.current = {
      chatId: landed ? chatId : undefined,
      seen: onScreen,
    };
    if (!landed || previous.chatId !== chatId) return;

    const arrival = readArrival({ seen: previous.seen, messages });
    if (!arrival.appended) return;

    // Follow the latest only when pinned at the bottom; otherwise hold the
    // viewport and mark the arrivals instead — never yank a scrolled-up reader
    // down (#189).
    if (atBottomRef.current) {
      surface.scrollToIndex(messages.length - 1, { align: "end" });
      scheduleFrame(measurePill);
      return;
    }
    // Set-once-then-freeze: the divider anchors to the first Message that
    // arrived unseen, and later arrivals leave it put, so it keeps marking
    // where the reader actually left off. The freeze lasts as long as the
    // Message it names still renders — once that Message is gone the divider
    // shows nothing, and holding on to it would silence every arrival for the
    // rest of the visit.
    setUnreadState((current) =>
      current.dividerMessageId !== null &&
      onScreen.has(current.dividerMessageId)
        ? current
        : { dividerMessageId: arrival.firstUnseen.id, consumed: false }
    );
  }, [chatId, messages, surface, measurePill, scheduleFrame]);

  // Keep the pill correct as content height changes (messages expanding or
  // collapsing) even without a scroll event.
  useEffect(() => {
    // Reading the column's layout is the external system an effect is for, and
    // the setState inside the measurement is that reading coming back — not the
    // cascade of render-derived state the rule is aimed at.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measurePill();
  }, [contentHeight, measurePill]);

  const unread = useMemo(
    () => ({
      dividerIndex,
      pillVisible: dividerIndex !== null && !unreadState.consumed,
      onJump: onJumpUnread,
    }),
    [dividerIndex, unreadState.consumed, onJumpUnread]
  );

  return useMemo(
    () => ({
      scrollPill: pillTarget,
      unread,
      onScroll,
      onJumpTop,
      onJumpBottom,
    }),
    [pillTarget, unread, onScroll, onJumpTop, onJumpBottom]
  );
}
