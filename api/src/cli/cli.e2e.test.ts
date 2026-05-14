import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "../..");
const entry = path.join(apiRoot, "src/index.ts");
const tsxBin = path.resolve(apiRoot, "node_modules/.bin/tsx");
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(apiRoot, "../package.json"), "utf-8")
) as { version: string };

type RunResult = { stdout: string; stderr: string; code: number | null };

function runCli(args: readonly string[], timeoutMs = 5000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(tsxBin, [entry, ...args], {
      env: { ...process.env, PORT: "0" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`cli did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("cli --version", () => {
  it("prints package version and exits 0 without side effects", async () => {
    const result = await runCli(["--version"], 3000);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
    expect(result.stdout).not.toContain("running at");
  });

  it("supports -v short flag", async () => {
    const result = await runCli(["-v"], 3000);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });
});

describe("cli --help", () => {
  it("prints help and exits 0 without starting the server", async () => {
    const result = await runCli(["--help"], 3000);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: chat-log");
    expect(result.stdout).toContain("--version");
    expect(result.stdout).toContain("--help");
    expect(result.stdout).toContain("PORT=");
    expect(result.stdout).not.toContain("running at");
  });

  it("supports -h short flag", async () => {
    const result = await runCli(["-h"], 3000);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: chat-log");
  });
});
