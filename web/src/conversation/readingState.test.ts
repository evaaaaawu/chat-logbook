import { describe, it, expect, beforeEach } from "vitest";
import {
  loadReadingState,
  saveReadingState,
  READING_STATE_LIMIT,
} from "./readingState";

function anchoredAt(messageId: string): {
  anchor: { messageId: string; offset: number };
  openRows: readonly string[];
} {
  return { anchor: { messageId, offset: 0 }, openRows: [] };
}

beforeEach(() => {
  localStorage.clear();
});

describe("readingState", () => {
  it("round-trips a saved anchor and open rows", () => {
    saveReadingState("chat-1", {
      anchor: { messageId: "m-42", offset: 12 },
      openRows: ["m-1:0", "m-3:2"],
    });

    const state = loadReadingState("chat-1");

    expect(state).toEqual({
      anchor: { messageId: "m-42", offset: 12 },
      openRows: ["m-1:0", "m-3:2"],
    });
  });

  it("returns null for a chat with nothing remembered", () => {
    saveReadingState("chat-1", { anchor: null, openRows: [] });

    expect(loadReadingState("chat-unknown")).toBeNull();
  });

  it("evicts the oldest chat once past the bound", () => {
    // One more than the bound: the very first chat written should be dropped.
    for (let i = 0; i < READING_STATE_LIMIT + 1; i++) {
      saveReadingState(`chat-${i}`, anchoredAt(`m-${i}`));
    }

    expect(loadReadingState("chat-0")).toBeNull();
    expect(loadReadingState("chat-1")).toEqual(anchoredAt("m-1"));
    expect(loadReadingState(`chat-${READING_STATE_LIMIT}`)).toEqual(
      anchoredAt(`m-${READING_STATE_LIMIT}`)
    );
  });

  it("spares a re-read chat from eviction by moving it to the front", () => {
    saveReadingState("chat-old", anchoredAt("m-old"));
    // Re-reading it writes again, so it should outlive a full bound of newer
    // chats rather than being dropped as the oldest.
    saveReadingState("chat-old", anchoredAt("m-old-again"));
    for (let i = 0; i < READING_STATE_LIMIT - 1; i++) {
      saveReadingState(`chat-${i}`, anchoredAt(`m-${i}`));
    }

    expect(loadReadingState("chat-old")).toEqual(anchoredAt("m-old-again"));
  });
});
