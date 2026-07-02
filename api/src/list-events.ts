/**
 * A list-change event pushed to connected clients so the loaded list window can
 * reconcile without a periodic full refetch (issue #132). The payload is kept
 * deliberately small: the client responds by re-reading its window head through
 * the keyset query, which already applies the active sort and filter
 * server-side — the event is the signal, not the data.
 */
export interface ListEvent {
  type: "changed";
}

export type ListEventListener = (event: ListEvent) => void;

/**
 * An in-process publish/subscribe hub for {@link ListEvent}s. The ingestion
 * watcher publishes after each ingest pass settles; the SSE route subscribes
 * per connection and forwards events to its client. One hub lives for the
 * process lifetime.
 */
export interface ListEventHub {
  publish(event: ListEvent): void;
  /** Register a listener; the returned function unsubscribes it. */
  subscribe(listener: ListEventListener): () => void;
}

export function createListEventHub(): ListEventHub {
  const listeners = new Set<ListEventListener>();
  return {
    publish(event) {
      for (const listener of listeners) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
