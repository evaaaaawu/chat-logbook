import { describe, expect, it } from "vitest";
import { CROCKFORD_ALPHABET, generateShortCode } from "./short-code.js";

const ALLOWED = new Set(CROCKFORD_ALPHABET);

describe("generateShortCode", () => {
  it("returns a 6-character string using only Crockford alphabet", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateShortCode({ isTaken: () => false });
      expect(code).toHaveLength(6);
      for (const ch of code) {
        expect(ALLOWED.has(ch)).toBe(true);
      }
    }
  });

  it("retries when isTaken reports a collision, returning the first free code", () => {
    const sequences = [
      [0, 0, 0, 0, 0, 0], // → "000000"
      [1, 1, 1, 1, 1, 1], // → "111111"
      [2, 2, 2, 2, 2, 2], // → "222222"
    ];
    let cursor = 0;
    const randomIndex = (): number => {
      const seq = sequences[Math.floor(cursor / 6)]!;
      const value = seq[cursor % 6]!;
      cursor++;
      return value;
    };
    const taken = new Set(["000000", "111111"]);

    const code = generateShortCode({
      isTaken: (c) => taken.has(c),
      randomIndex,
    });

    expect(code).toBe("222222");
  });

  it("throws when every retry collides", () => {
    expect(() =>
      generateShortCode({
        isTaken: () => true,
        randomIndex: () => 0,
      })
    ).toThrow(/short_code/);
  });

  it("excludes i, l, o, u from the alphabet", () => {
    for (const banned of ["i", "l", "o", "u"]) {
      expect(ALLOWED.has(banned)).toBe(false);
    }
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
  });
});
