import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDataDir } from "./data-dir.js";

describe("resolveDataDir", () => {
  it("defaults to <homeDir>/.chat-logbook when the variable is unset", () => {
    expect(resolveDataDir({}, "/home/eva")).toBe(
      path.join("/home/eva", ".chat-logbook")
    );
  });

  it("uses CHAT_LOGBOOK_DATA_DIR when set to an absolute path", () => {
    expect(
      resolveDataDir({ CHAT_LOGBOOK_DATA_DIR: "/tmp/seed-1" }, "/home/eva")
    ).toBe("/tmp/seed-1");
  });

  it("treats an empty or whitespace-only value as unset", () => {
    const expected = path.join("/home/eva", ".chat-logbook");
    expect(resolveDataDir({ CHAT_LOGBOOK_DATA_DIR: "" }, "/home/eva")).toBe(
      expected
    );
    expect(resolveDataDir({ CHAT_LOGBOOK_DATA_DIR: "   " }, "/home/eva")).toBe(
      expected
    );
  });

  it("resolves a relative override to an absolute path", () => {
    const result = resolveDataDir(
      { CHAT_LOGBOOK_DATA_DIR: "./seed-dir" },
      "/home/eva"
    );
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toBe(path.resolve("./seed-dir"));
  });
});
