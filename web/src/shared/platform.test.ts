import { describe, it, expect } from "vitest";
import { isMacPlatform, modifierHint } from "./platform";

describe("modifierHint", () => {
  it("joins the ⌘ glyph directly to the key on macOS", () => {
    expect(modifierHint("Z", true)).toBe("⌘Z");
  });

  it("joins Ctrl to the key with a + on non-macOS", () => {
    expect(modifierHint("Z", false)).toBe("Ctrl+Z");
  });
});

describe("isMacPlatform", () => {
  it("detects a macOS navigator", () => {
    const nav = { platform: "MacIntel" } as Navigator;
    expect(isMacPlatform(nav)).toBe(true);
  });

  it("returns false for a non-mac navigator", () => {
    const nav = { platform: "Win32" } as Navigator;
    expect(isMacPlatform(nav)).toBe(false);
  });

  it("defaults to false (Ctrl) when the platform is unknown", () => {
    const nav = { platform: "" } as Navigator;
    expect(isMacPlatform(nav)).toBe(false);
  });

  it("resolves the current platform when no navigator is passed", () => {
    // jsdom reports an empty platform, so the no-arg call should not throw and
    // falls back to the Ctrl branch.
    expect(modifierHint("Z")).toBe("Ctrl+Z");
  });
});
