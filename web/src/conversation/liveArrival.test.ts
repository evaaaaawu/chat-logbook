import { describe, it, expect } from "vitest";
import { deriveArrivalAction } from "@/conversation/liveArrival";

describe("deriveArrivalAction", () => {
  it("follows to the latest when messages arrive while pinned to the bottom", () => {
    expect(deriveArrivalAction({ appended: true, atBottom: true })).toBe(
      "follow"
    );
  });

  it("flags new content when messages arrive while scrolled up", () => {
    expect(deriveArrivalAction({ appended: true, atBottom: false })).toBe(
      "flag"
    );
  });

  it("does nothing when the message count did not grow", () => {
    expect(deriveArrivalAction({ appended: false, atBottom: false })).toBe(
      "none"
    );
    expect(deriveArrivalAction({ appended: false, atBottom: true })).toBe(
      "none"
    );
  });
});
