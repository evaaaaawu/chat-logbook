import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  useConversationStream,
  type ConversationStreamConnector,
} from "@/conversation/useConversationStream";

// A connector double: captures the handler the hook wires up so the test can
// push `changed` payloads deterministically, and counts open/close calls.
function fakeConnector() {
  let onChanged: ((chatIds: string[]) => void) | null = null;
  let closeCount = 0;
  let openCount = 0;
  const connect: ConversationStreamConnector = (h) => {
    onChanged = h.onChanged;
    openCount += 1;
    return {
      close() {
        closeCount += 1;
      },
    };
  };
  return {
    connect,
    emitChanged: (chatIds: string[]) => onChanged?.(chatIds),
    get closeCount() {
      return closeCount;
    },
    get openCount() {
      return openCount;
    },
  };
}

describe("useConversationStream", () => {
  it("invokes onChanged when the open chat is among the changed ids", () => {
    const fake = fakeConnector();
    const onChanged = vi.fn();
    renderHook(() =>
      useConversationStream("clog_abc", onChanged, { connect: fake.connect })
    );

    act(() => fake.emitChanged(["clog_xyz", "clog_abc"]));

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("ignores events that do not name the open chat", () => {
    const fake = fakeConnector();
    const onChanged = vi.fn();
    renderHook(() =>
      useConversationStream("clog_abc", onChanged, { connect: fake.connect })
    );

    act(() => fake.emitChanged(["clog_xyz"]));

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("opens no connection while no chat is open", () => {
    const fake = fakeConnector();
    renderHook(() =>
      useConversationStream(null, vi.fn(), { connect: fake.connect })
    );

    expect(fake.openCount).toBe(0);
  });

  it("closes the connection on unmount", () => {
    const fake = fakeConnector();
    const { unmount } = renderHook(() =>
      useConversationStream("clog_abc", vi.fn(), { connect: fake.connect })
    );
    expect(fake.openCount).toBe(1);

    unmount();

    expect(fake.closeCount).toBe(1);
  });
});
