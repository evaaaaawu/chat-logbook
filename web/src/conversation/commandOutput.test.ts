import { describe, it, expect } from "vitest";
import { capLines } from "./commandOutput";

describe("capLines", () => {
  it("keeps only the first lines and reports how many it held back", () => {
    const output = ["one", "two", "three", "four"].join("\n");

    expect(capLines(output, 2)).toEqual({
      lines: ["one", "two"],
      hiddenLines: 2,
    });
  });
});
