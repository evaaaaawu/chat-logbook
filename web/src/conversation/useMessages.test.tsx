import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, it, expect, vi } from "vitest";
import { useMessages } from "@/conversation/useMessages";
import type { ConversationStreamConnector } from "@/conversation/useConversationStream";
import { server } from "@/test/server";
import type { Message } from "@/types";

let nextMessageId = 0;

function message(role: Message["role"], text: string): Message {
  return {
    id: `m-${(nextMessageId += 1)}`,
    role,
    content: text,
    timestamp: "2024-01-01T00:00:00Z",
  };
}

// A connector double that lets the test push a `changed` event for given ids.
function fakeConnector() {
  let onChanged: ((chatIds: string[]) => void) | null = null;
  const connect: ConversationStreamConnector = (h) => {
    onChanged = h.onChanged;
    return { close() {} };
  };
  return {
    connect,
    emitChanged: (chatIds: string[]) => onChanged?.(chatIds),
  };
}

describe("useMessages live updates", () => {
  it("appends messages ingested for the open chat without reopening it", async () => {
    let served: Message[] = [message("user", "first")];
    server.use(
      http.get("/api/chats/:id", () => HttpResponse.json({ messages: served }))
    );
    const fake = fakeConnector();

    const { result } = renderHook(() =>
      useMessages("clog_abc", { connect: fake.connect })
    );

    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    // A new message is ingested for this chat; the server now serves both.
    served = [message("user", "first"), message("assistant", "second")];
    act(() => fake.emitChanged(["clog_abc"]));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1].content).toBe("second");
  });

  it("does not re-fetch when the event names other chats only", async () => {
    const fetchSpy = vi.fn(() =>
      HttpResponse.json({ messages: [message("user", "first")] })
    );
    server.use(http.get("/api/chats/:id", fetchSpy));
    const fake = fakeConnector();

    const { result } = renderHook(() =>
      useMessages("clog_abc", { connect: fake.connect })
    );
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    act(() => fake.emitChanged(["clog_other"]));

    // No second request: the event named a chat that is not open.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
