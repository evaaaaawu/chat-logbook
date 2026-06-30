import { useEffect, useRef } from "react";

// The live-update channel endpoint (issue #132). The server pushes a `changed`
// event after each ingest pass; the client reconciles its loaded window head in
// response (see useListStream's consumer).
const STREAM_URL = "/api/chats/stream";

// Reconnect backoff after a dropped connection: start at 1s, double each
// successive failure, cap at 30s. A healthy event resets it to the base.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/** A live connection to the list-change stream; `close` tears it down. */
export interface ListStreamConnection {
  close(): void;
}

/**
 * Opens a connection to the list-change stream. Injected so the hook is testable
 * without a real EventSource (jsdom has none) and so the transport can change
 * without touching the reconnect logic. `onChanged` fires per pushed change;
 * `onError` fires when the connection drops so the hook can reconnect.
 */
export type ListStreamConnector = (handlers: {
  onChanged: () => void;
  onError: () => void;
}) => ListStreamConnection;

// The default connector rides Server-Sent Events. In jsdom (tests) EventSource
// is absent, so it returns an inert connection — those tests drive the hook
// through an injected connector instead.
const defaultConnect: ListStreamConnector = ({ onChanged, onError }) => {
  if (typeof EventSource === "undefined") {
    return { close() {} };
  }
  const source = new EventSource(STREAM_URL);
  source.addEventListener("changed", () => onChanged());
  source.addEventListener("error", () => onError());
  return { close: () => source.close() };
};

export interface UseListStreamOptions {
  /** When false, the hook holds no connection. Defaults to true. */
  enabled?: boolean;
  /** Connection factory; defaults to the Server-Sent Events transport. */
  connect?: ListStreamConnector;
}

/**
 * Subscribe to server-pushed list-change events, invoking `onChanged` on each.
 * Replaces the periodic poll that drove the window refresh: the connection
 * carries a push the instant ingestion settles, instead of a fixed-interval
 * refetch (issue #132 / ADR-0020).
 */
export function useListStream(
  onChanged: () => void,
  { enabled = true, connect = defaultConnect }: UseListStreamOptions = {}
): void {
  // Keep the latest callback without re-opening the connection when its identity
  // changes (it is rebuilt every render by the consumer).
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!enabled) return;

    let connection: ListStreamConnection | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      connection = connect({
        onChanged: () => {
          // A healthy event means the connection is up; reset the backoff.
          attempt = 0;
          onChangedRef.current();
        },
        onError: () => {
          // The connection dropped. Tear it down and reconnect after a growing
          // backoff so a flapping server is not hammered (AC: graceful recovery).
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
  }, [enabled, connect]);
}
