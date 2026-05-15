import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr) {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("could not allocate port"));
      }
    });
  });
}

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

describe("cli --port", () => {
  let child: ChildProcess | null = null;
  let tmpHome: string | null = null;

  afterEach(async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((r) => child!.once("exit", r));
    }
    child = null;
    if (tmpHome) {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      tmpHome = null;
    }
  });

  it("starts the server on the port from --port flag", async () => {
    const port = await findFreePort();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "chat-log-e2e-"));
    child = spawn(tsxBin, [entry, "--port", String(port)], {
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome, PORT: "" },
    });

    const stdout = await new Promise<string>((resolve, reject) => {
      let buf = "";
      const t = setTimeout(
        () => reject(new Error(`no startup log within 8s; got: ${buf}`)),
        8000
      );
      child!.stdout!.on("data", (b) => {
        buf += b.toString();
        if (buf.includes(`localhost:${port}`)) {
          clearTimeout(t);
          resolve(buf);
        }
      });
      child!.on("exit", (code) => {
        clearTimeout(t);
        reject(new Error(`exited early (code=${code}); stdout: ${buf}`));
      });
    });

    expect(stdout).toContain(`http://localhost:${port}`);
  });

  it("exits non-zero with clear error on invalid --port value", async () => {
    const result = await runCli(["--port", "abc"], 3000);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/abc/);
  });
});
