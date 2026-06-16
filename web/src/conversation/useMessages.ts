import { useEffect, useState } from "react";
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

export function useMessages(chatId: string | null): {
  messages: Message[];
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<MessagesState>(initialState);

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
  }, [chatId]);

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
