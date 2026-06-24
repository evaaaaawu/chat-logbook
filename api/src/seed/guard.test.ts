import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSeedDataDirSafe } from "./guard.js";

describe("assertSeedDataDirSafe", () => {
  it("refuses to seed the real ~/.chat-logbook archive", () => {
    const real = path.join("/home/eva", ".chat-logbook");
    expect(() => assertSeedDataDirSafe(real, "/home/eva")).toThrow(
      /chat-logbook/
    );
  });

  it("allows an isolated dev or throwaway directory", () => {
    expect(() =>
      assertSeedDataDirSafe("/home/eva/.chat-logbook-dev", "/home/eva")
    ).not.toThrow();
    expect(() =>
      assertSeedDataDirSafe("/tmp/seed-bench", "/home/eva")
    ).not.toThrow();
  });
});
