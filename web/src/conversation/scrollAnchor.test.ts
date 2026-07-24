import { describe, it, expect } from "vitest";
import { pickAnchor, resolveAnchorIndex } from "./scrollAnchor";

// Three messages laid out top to bottom at these vertical starts.
const entries = [
  { messageId: "m-1", start: 0 },
  { messageId: "m-2", start: 100 },
  { messageId: "m-3", start: 260 },
];

describe("pickAnchor", () => {
  it("anchors to the topmost visible message and its within-message offset", () => {
    // Scrolled so the viewport top sits 30px into the second message.
    const anchor = pickAnchor({ scrollTop: 130, entries });

    expect(anchor).toEqual({ messageId: "m-2", offset: 30 });
  });
});

describe("resolveAnchorIndex", () => {
  const messages = [{ id: "m-1" }, { id: "m-2" }, { id: "m-3" }];

  it("finds the list position of the anchored message", () => {
    const index = resolveAnchorIndex(
      { messageId: "m-3", offset: 20 },
      messages
    );

    expect(index).toBe(2);
  });

  it("returns null when the anchored message no longer exists", () => {
    const index = resolveAnchorIndex(
      { messageId: "gone", offset: 20 },
      messages
    );

    expect(index).toBeNull();
  });

  it("returns null when there is no anchor", () => {
    expect(resolveAnchorIndex(null, messages)).toBeNull();
  });
});
