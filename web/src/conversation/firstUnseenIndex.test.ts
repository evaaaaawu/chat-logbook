import { describe, it, expect } from "vitest";
import { deriveFirstUnseenIndex } from "@/conversation/firstUnseenIndex";
import type { ArrivalAction } from "@/conversation/liveArrival";

function derive(
  current: number | null,
  action: ArrivalAction,
  prevLen: number
): number | null {
  return deriveFirstUnseenIndex({ current, action, prevLen });
}

describe("deriveFirstUnseenIndex", () => {
  it("marks the first new message on the first flag", () => {
    // Three messages were on screen; a fourth arrives scrolled up. The divider
    // belongs before index 3 (the first unseen).
    expect(derive(null, "flag", 3)).toBe(3);
  });

  it("freezes the marker once set, so later arrivals do not move it", () => {
    expect(derive(3, "flag", 5)).toBe(3);
  });

  it("leaves the marker untouched when following at the bottom", () => {
    expect(derive(null, "follow", 5)).toBe(null);
    expect(derive(3, "follow", 5)).toBe(3);
  });

  it("leaves the marker untouched when nothing was appended", () => {
    expect(derive(null, "none", 5)).toBe(null);
    expect(derive(3, "none", 5)).toBe(3);
  });
});
