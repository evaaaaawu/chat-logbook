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

  it("returns run with port from --port flag", () => {
    expect(parseCliArgs(["--port", "8080"])).toEqual({
      kind: "run",
      port: 8080,
    });
  });

  it("returns run with port from -p flag", () => {
    expect(parseCliArgs(["-p", "8080"])).toEqual({ kind: "run", port: 8080 });
  });

  it("prefers --port flag over PORT env", () => {
    expect(parseCliArgs(["--port", "8080"], { PORT: "9000" })).toEqual({
      kind: "run",
      port: 8080,
    });
  });

  it("falls back to PORT env when flag absent", () => {
    expect(parseCliArgs([], { PORT: "9000" })).toEqual({
      kind: "run",
      port: 9000,
    });
  });

  it("returns error when --port has no value", () => {
    const result = parseCliArgs(["--port"]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/--port.*value/i);
    }
  });

  it("returns error when --port value is non-numeric", () => {
    const result = parseCliArgs(["--port", "abc"]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/abc/);
    }
  });

  it("returns error when --port value is out of range", () => {
    expect(parseCliArgs(["--port", "0"]).kind).toBe("error");
    expect(parseCliArgs(["--port", "65536"]).kind).toBe("error");
    expect(parseCliArgs(["--port", "-1"]).kind).toBe("error");
  });
});
