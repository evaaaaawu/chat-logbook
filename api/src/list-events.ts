/**
 * A change event pushed to connected clients so the loaded list window can
 * reconcile without a periodic full refetch (issue #132). The payload is kept
 * deliberately small: the client responds by re-reading through the queries that
 * already apply the active sort and filter server-side — the event is the
 * signal, not the data.
 *
 * `chatIds` names the chats this ingest pass wrote a message to. It scopes the
 * re-read for a client showing one conversation, which would otherwise re-fetch
 * that whole chat whenever any other session wrote (issue #189). The list
 * ignores it: any write can reorder the window, so the list reconciles on every
 * event.
 */
export interface ListEvent {
  type: "changed";
  chatIds?: string[];
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
