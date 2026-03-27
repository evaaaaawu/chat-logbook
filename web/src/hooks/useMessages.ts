import { useEffect, useState } from "react";
import type { Message } from "@/types";

export function useMessages(sessionId: string | null): {
  messages: Message[];
  loading: boolean;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((data: { messages: Message[] }) => {
        if (!cancelled) {
          setMessages(data.messages);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { messages: sessionId ? messages : [], loading };
}
