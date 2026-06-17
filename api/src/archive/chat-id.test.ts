import { describe, expect, it } from "vitest";
import {
  CHAT_ID_PREFIX,
  CROCKFORD_ALPHABET,
  formatChatId,
  generateChatId,
  parseChatId,
} from "./chat-id.js";

const ALLOWED = new Set(CROCKFORD_ALPHABET);

describe("generateChatId", () => {
  it("returns a 6-character string using only Crockford alphabet", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateChatId({ isTaken: () => false });
      expect(code).toHaveLength(6);
      for (const ch of code) {
        expect(ALLOWED.has(ch)).toBe(true);
      }
    }
  });

  it("retries when isTaken reports a collision, returning the first free code", () => {
    const sequences = [
      [0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 2],
    ];
    let cursor = 0;
    const randomIndex = (): number => {
      const seq = sequences[Math.floor(cursor / 6)]!;
      const value = seq[cursor % 6]!;
      cursor++;
      return value;
    };
    const taken = new Set(["000000", "111111"]);

    const code = generateChatId({
      isTaken: (c) => taken.has(c),
      randomIndex,
    });

    expect(code).toBe("222222");
  });

  it("throws when every retry collides", () => {
    expect(() =>
      generateChatId({
        isTaken: () => true,
        randomIndex: () => 0,
      })
    ).toThrow(/chat_id/);
  });

  it("excludes i, l, o, u from the alphabet", () => {
    for (const banned of ["i", "l", "o", "u"]) {
      expect(ALLOWED.has(banned)).toBe(false);
    }
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
  });
});

describe("formatChatId / parseChatId", () => {
  it("formats a bare code into the clog_ wire form", () => {
    expect(formatChatId("a3f7kx")).toBe("clog_a3f7kx");
    expect(CHAT_ID_PREFIX).toBe("clog_");
  });

  it("parses a wire-form id back to the bare code", () => {
    expect(parseChatId("clog_a3f7kx")).toBe("a3f7kx");
  });

  it("round-trips format then parse", () => {
    const code = generateChatId({ isTaken: () => false });
    expect(parseChatId(formatChatId(code))).toBe(code);
  });

  it("returns null when the clog_ prefix is missing", () => {
    expect(parseChatId("a3f7kx")).toBeNull();
  });

  it("returns null when the code is the wrong length", () => {
    expect(parseChatId("clog_a3f7k")).toBeNull();
    expect(parseChatId("clog_a3f7kxy")).toBeNull();
  });

  it("returns null when the code has non-Crockford characters", () => {
    // i, l, o, u are excluded from the alphabet
    expect(parseChatId("clog_a3f7ki")).toBeNull();
    expect(parseChatId("clog_A3F7KX")).toBeNull();
  });
});
