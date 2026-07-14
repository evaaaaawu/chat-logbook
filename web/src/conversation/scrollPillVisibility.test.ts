import { describe, expect, it } from "vitest";
import { getScrollPillTarget } from "@/conversation/scrollPillVisibility";

describe("getScrollPillTarget", () => {
  it("offers jump-to-bottom when scrolled to the top", () => {
    expect(
      getScrollPillTarget({
        scrollTop: 0,
        scrollHeight: 2000,
        clientHeight: 600,
      })
    ).toBe("bottom");
  });

  it("offers jump-to-bottom mid-scroll", () => {
    expect(
      getScrollPillTarget({
        scrollTop: 700,
        scrollHeight: 2000,
        clientHeight: 600,
      })
    ).toBe("bottom");
  });

  it("offers back-to-top only once pinned at the bottom", () => {
    expect(
      getScrollPillTarget({
        scrollTop: 1400,
        scrollHeight: 2000,
        clientHeight: 600,
      })
    ).toBe("top");
  });

  it("hides the pill when the content is too short to scroll", () => {
    expect(
      getScrollPillTarget({
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 600,
      })
    ).toBeNull();
  });
});
