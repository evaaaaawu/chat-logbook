import { useEffect, useRef } from "react";

// The live-update channel endpoint, shared with the list (issue #189). The
// server pushes a `changed` event after each ingest pass, its data frame naming
// the chats that changed; this hook re-reads the open conversation only when its
// chat is among them.
const STREAM_URL = "/api/chats/stream";

// Reconnect backoff after a dropped connection: start at 1s, double each
// successive failure, cap at 30s. A healthy event resets it to the base.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/** A live connection to the change stream; `close` tears it down. */
export interface ConversationStreamConnection {
  close(): void;
}

/**
 * Opens a connection to the change stream. Injected so the hook is testable
 * without a real EventSource (jsdom has none) and so the transport can change
 * without touching the reconnect logic. `onChanged` fires per pushed change with
 * the changed chat ids; `onError` fires when the connection drops.
 */
export type ConversationStreamConnector = (handlers: {
  onChanged: (chatIds: string[]) => void;
  onError: () => void;
}) => ConversationStreamConnection;

// The default connector rides Server-Sent Events. In jsdom (tests) EventSource
// is absent, so it returns an inert connection — those tests drive the hook
// through an injected connector instead.
const defaultConnect: ConversationStreamConnector = ({
  onChanged,
  onError,
}) => {
  if (typeof EventSource === "undefined") {
    return { close() {} };
  }
  const source = new EventSource(STREAM_URL);
  source.addEventListener("changed", (event) => {
    onChanged(parseChatIds((event as MessageEvent).data));
  });
  source.addEventListener("error", () => onError());
  return { close: () => source.close() };
};

// The data frame is `{ chatIds: string[] }`. Parse defensively: a malformed or
// empty frame yields no ids, so a bad payload simply never matches the open chat
// rather than throwing on the stream thread.
function parseChatIds(data: unknown): string[] {
  if (typeof data !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(data);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { chatIds?: unknown }).chatIds)
    ) {
      return (parsed as { chatIds: unknown[] }).chatIds.filter(
        (id): id is string => typeof id === "string"
      );
    }
  } catch {
    // Ignore a malformed frame.
  }
  return [];
}

export interface UseConversationStreamOptions {
  /** Connection factory; defaults to the Server-Sent Events transport. */
  connect?: ConversationStreamConnector;
}

/**
 * Subscribe to server-pushed change events for the open conversation, invoking
 * `onChanged` whenever an event names `chatId`. Holds no connection while no
 * chat is open. The push carries the change the instant ingestion settles, so a
 * running session's new messages arrive without reopening the chat (issue #189).
 */
export function useConversationStream(
  chatId: string | null,
  onChanged: () => void,
  { connect = defaultConnect }: UseConversationStreamOptions = {}
): void {
  // Keep the latest callback without re-opening the connection when its identity
  // changes (it is rebuilt every render by the consumer).
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!chatId) return;

    let connection: ConversationStreamConnection | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      connection = connect({
        onChanged: (chatIds) => {
          // A healthy event means the connection is up; reset the backoff.
          attempt = 0;
          if (chatIds.includes(chatId)) onChangedRef.current();
        },
        onError: () => {
          // The connection dropped. Tear it down and reconnect after a growing
          // backoff so a flapping server is not hammered.
          connection?.close();
          connection = null;
          const delay = Math.min(
            RECONNECT_BASE_MS * 2 ** attempt,
            RECONNECT_MAX_MS
          );
          attempt += 1;
          reconnectTimer = setTimeout(open, delay);
        },
      });
    };

    open();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      connection?.close();
    };
  }, [chatId, connect]);
}
