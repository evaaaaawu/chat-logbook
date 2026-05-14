import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./argv.js";

describe("parseCliArgs", () => {
  it("returns version action for --version", () => {
    expect(parseCliArgs(["--version"])).toEqual({ kind: "version" });
  });

  it("returns version action for -v", () => {
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
  });

  it("returns run with default port 3100 for empty argv", () => {
    expect(parseCliArgs([])).toEqual({ kind: "run", port: 3100 });
  });

  it("returns help action for --help", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
  });

  it("returns help action for -h", () => {
    expect(parseCliArgs(["-h"])).toEqual({ kind: "help" });
  });

  it("falls back to PORT env when argv is empty", () => {
    expect(parseCliArgs([], { PORT: "9000" })).toEqual({
      kind: "run",
      port: 9000,
    });
  });
});
