import { useCallback, useEffect, useState } from "react";
import {
  useConversationStream,
  type ConversationStreamConnector,
} from "@/conversation/useConversationStream";
import type { Message } from "@/types";

interface MessagesState {
  chatId: string | null;
  messages: Message[];
  error: string | null;
}

const initialState: MessagesState = {
  chatId: null,
  messages: [],
  error: null,
};

export interface UseMessagesOptions {
  /** Stream connection factory; defaults to the Server-Sent Events transport. */
  connect?: ConversationStreamConnector;
}

export function useMessages(
  chatId: string | null,
  { connect }: UseMessagesOptions = {}
): {
  messages: Message[];
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<MessagesState>(initialState);
  // Bumped by a live push for the open chat; a change re-runs the fetch effect
  // so newly ingested messages append without reopening the chat (issue #189).
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!chatId) return;

    let cancelled = false;

    fetch(`/api/chats/${chatId}?includeTrashed=true`)
      .then((res) => {
        if (!res.ok) {
          return res.json().then((body: { error?: string }) => {
            throw new Error(body.error ?? `Request failed (${res.status})`);
          });
        }
        return res.json();
      })
      .then((data: { messages: Message[] }) => {
        if (!cancelled) {
          setState({ chatId, messages: data.messages, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            chatId,
            messages: [],
            error: err instanceof Error ? err.message : "Failed to load chat",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, reloadNonce]);

  // A live push naming the open chat triggers a re-read through the same fetch
  // path; the fetch effect keeps the last messages until the new set settles, so
  // the pane appends rather than flashing empty.
  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);
  useConversationStream(chatId, reload, { connect });

  // Derive loading/error from whether the resolved state matches the currently
  // requested chatId, instead of writing state synchronously inside the effect.
  // A request is in flight whenever the latest settled chatId does not match the
  // requested one. Messages keep the last loaded value until the new request
  // settles, matching the previous behavior.
  const settled = state.chatId === chatId;

  return {
    messages: chatId ? state.messages : [],
    loading: chatId !== null && !settled,
    error: chatId && settled ? state.error : null,
  };
}
