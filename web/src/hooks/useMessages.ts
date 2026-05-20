import { useEffect, useState } from "react";
import type { Message } from "@/types";

export function useMessages(chatId: string | null): {
  messages: Message[];
  loading: boolean;
  error: string | null;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

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
          setMessages(data.messages);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMessages([]);
          setError(err instanceof Error ? err.message : "Failed to load chat");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  return {
    messages: chatId ? messages : [],
    loading,
    error: chatId ? error : null,
  };
}
