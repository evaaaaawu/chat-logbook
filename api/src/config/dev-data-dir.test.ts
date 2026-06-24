import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDevDataDir } from "./dev-data-dir.js";

describe("resolveDevDataDir", () => {
  it("defaults to an isolated <homeDir>/.chat-logbook-dev when the variable is absent", () => {
    expect(resolveDevDataDir({}, "/home/eva")).toBe(
      path.join("/home/eva", ".chat-logbook-dev")
    );
  });

  it("respects CHAT_LOGBOOK_DATA_DIR when set to a path, so dev can point at a seeded dataset", () => {
    expect(
      resolveDevDataDir({ CHAT_LOGBOOK_DATA_DIR: "/tmp/seed-1" }, "/home/eva")
    ).toBe("/tmp/seed-1");
  });

  it("falls back to the real <homeDir>/.chat-logbook when the variable is present but empty (deliberate opt-out)", () => {
    const real = path.join("/home/eva", ".chat-logbook");
    expect(resolveDevDataDir({ CHAT_LOGBOOK_DATA_DIR: "" }, "/home/eva")).toBe(
      real
    );
    expect(
      resolveDevDataDir({ CHAT_LOGBOOK_DATA_DIR: "   " }, "/home/eva")
    ).toBe(real);
  });
});
