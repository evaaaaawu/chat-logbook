import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "../archive/repository.js";
import { messages, rawMessages, sessions } from "../archive/schema.js";
import { ClaudeCodePlugin } from "../plugins/claude-code/plugin.js";
import { runIngestion } from "./ingest.js";

const fixturesRoot = path.join(__dirname, "../__fixtures__/projects");

interface Env {
  dataDir: string;
  homeDir: string;
}

function setupEnv(): Env {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-ingest-"));
  const dataDir = path.join(tmp, "data");
  const homeDir = path.join(tmp, "home");
  const claudeProjects = path.join(homeDir, ".claude", "projects");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(claudeProjects, { recursive: true });
  fs.cpSync(fixturesRoot, claudeProjects, { recursive: true });
  return { dataDir, homeDir };
}

let env: Env;

beforeEach(() => {
  env = setupEnv();
});

afterEach(() => {
  fs.rmSync(path.dirname(env.dataDir), { recursive: true, force: true });
});

describe("runIngestion", () => {
  it("populates archive.db sessions, raw_messages, and messages from source on first run", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });

    const result = await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      env: { homeDir: env.homeDir },
    });

    expect(result.scanned).toBeGreaterThan(0);
    expect(result.rawInserted).toBeGreaterThan(0);
    expect(result.canonicalUpserted).toBeGreaterThan(0);

    const sessionRows = archive.db.select().from(sessions).all();
    const rawRows = archive.db.select().from(rawMessages).all();
    const msgRows = archive.db.select().from(messages).all();

    expect(sessionRows.length).toBeGreaterThan(0);
    expect(rawRows.length).toBeGreaterThan(0);
    expect(msgRows.length).toBeGreaterThan(0);
    expect(msgRows.length).toBeLessThanOrEqual(rawRows.length);

    for (const s of sessionRows) {
      expect(s.agent).toBe("claude-code");
      expect(s.shortCode).toHaveLength(6);
    }

    archive.close();
  });

  it("is a no-op on second run: zero new raw rows and row counts unchanged", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const pluginsList = [new ClaudeCodePlugin()];

    const first = await runIngestion({
      plugins: pluginsList,
      archive,
      env: { homeDir: env.homeDir },
    });
    const rawBefore = archive.db.select().from(rawMessages).all().length;
    const msgBefore = archive.db.select().from(messages).all().length;
    const sessBefore = archive.db.select().from(sessions).all().length;

    const second = await runIngestion({
      plugins: pluginsList,
      archive,
      env: { homeDir: env.homeDir },
    });

    expect(first.rawInserted).toBeGreaterThan(0);
    expect(second.rawInserted).toBe(0);
    expect(archive.db.select().from(rawMessages).all().length).toBe(rawBefore);
    expect(archive.db.select().from(messages).all().length).toBe(msgBefore);
    expect(archive.db.select().from(sessions).all().length).toBe(sessBefore);

    archive.close();
  });

  it("appends a new raw row when source content at the same line changes", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const pluginsList = [new ClaudeCodePlugin()];

    await runIngestion({
      plugins: pluginsList,
      archive,
      env: { homeDir: env.homeDir },
    });
    const rawBefore = archive.db.select().from(rawMessages).all();

    // Edit a line in the source: same line number, different payload.
    const sourceFile = path.join(
      env.homeDir,
      ".claude",
      "projects",
      "project-a",
      "session-1.jsonl"
    );
    const lines = fs.readFileSync(sourceFile, "utf-8").split("\n");
    // Find a real user message line and tweak its content.
    const idx = lines.findIndex(
      (l) => l.includes('"role":"user"') && l.includes("Build a login page")
    );
    expect(idx).toBeGreaterThanOrEqual(0);
    lines[idx] = lines[idx].replace(
      "Build a login page",
      "Build a signup page"
    );
    fs.writeFileSync(sourceFile, lines.join("\n"));

    const second = await runIngestion({
      plugins: pluginsList,
      archive,
      env: { homeDir: env.homeDir },
    });

    const rawAfter = archive.db.select().from(rawMessages).all();
    expect(second.rawInserted).toBe(1);
    expect(rawAfter.length).toBe(rawBefore.length + 1);

    // All original raw rows are still present (no overwrite).
    for (const before of rawBefore) {
      expect(rawAfter.some((r) => r.id === before.id)).toBe(true);
    }

    archive.close();
  });

  it("writes raw for every payload but skips messages when normalize returns null", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });

    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      env: { homeDir: env.homeDir },
    });

    const rawRows = archive.db.select().from(rawMessages).all();
    const msgRows = archive.db.select().from(messages).all();

    // Fixture contains file-history-snapshot, isMeta, and isSidechain rows
    // that the claude-code plugin skips. They must still appear in raw_messages.
    const hasMetaRaw = rawRows.some((r) => {
      const p = JSON.parse(r.rawPayload) as Record<string, unknown>;
      return p.isMeta === true || p.type === "file-history-snapshot";
    });
    expect(hasMetaRaw).toBe(true);

    // No message row should be a meta/snapshot/sidechain payload.
    const rawById = new Map(rawRows.map((r) => [r.id, r]));
    for (const m of msgRows) {
      const raw = rawById.get(m.rawId);
      expect(raw).toBeDefined();
      const p = JSON.parse(raw!.rawPayload) as Record<string, unknown>;
      expect(p.isMeta).not.toBe(true);
      expect(p.isSidechain).not.toBe(true);
      expect(p.type === "user" || p.type === "assistant").toBe(true);
    }

    // Strict inequality: there are skipped raw rows.
    expect(msgRows.length).toBeLessThan(rawRows.length);

    archive.close();
  });

  it("mtime fast path: skips files whose mtime and size are unchanged since last scan", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });

    // First run records scan state.
    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      env: { homeDir: env.homeDir },
    });

    // Track which sessions actually opened their source file on the second run.
    const opened: string[] = [];
    const observedPlugin = new ClaudeCodePlugin();
    const originalExtract = observedPlugin.extractRaw.bind(observedPlugin);
    observedPlugin.extractRaw = async function* (ref) {
      opened.push(ref.sessionId);
      yield* originalExtract(ref);
    };

    const second = await runIngestion({
      plugins: [observedPlugin],
      archive,
      env: { homeDir: env.homeDir },
    });

    expect(second.skippedByMtime).toBeGreaterThan(0);
    expect(opened).toEqual([]);
    expect(second.rawInserted).toBe(0);

    archive.close();
  });

  it("mtime fast path: re-reads a file when mtime changes", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });

    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      env: { homeDir: env.homeDir },
    });

    // Append a new line and bump mtime explicitly to ensure the change is visible.
    const sourceFile = path.join(
      env.homeDir,
      ".claude",
      "projects",
      "project-a",
      "session-1.jsonl"
    );
    const newLine = JSON.stringify({
      type: "user",
      message: { role: "user", content: "another question" },
      isMeta: false,
      uuid: "msg-new",
      timestamp: "2024-01-02T00:00:00Z",
      sessionId: "session-1",
      isSidechain: false,
    });
    fs.appendFileSync(sourceFile, newLine + "\n");
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(sourceFile, future, future);

    const second = await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      env: { homeDir: env.homeDir },
    });

    expect(second.rawInserted).toBe(1);
    expect(second.skippedByMtime).toBe(0);

    archive.close();
  });

  it("preserves archive rows when source file is shrunk between scans", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });

    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      env: { homeDir: env.homeDir },
    });
    const rawBefore = archive.db.select().from(rawMessages).all();
    const msgBefore = archive.db.select().from(messages).all();
    const sessBefore = archive.db.select().from(sessions).all();
    expect(rawBefore.length).toBeGreaterThan(1);

    // Truncate source file to a single line (simulate vendor pruning).
    const sourceFile = path.join(
      env.homeDir,
      ".claude",
      "projects",
      "project-a",
      "session-1.jsonl"
    );
    const lines = fs.readFileSync(sourceFile, "utf-8").split("\n");
    fs.writeFileSync(sourceFile, (lines[0] ?? "") + "\n");
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(sourceFile, future, future);

    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      env: { homeDir: env.homeDir },
    });

    const rawAfter = archive.db.select().from(rawMessages).all();
    const msgAfter = archive.db.select().from(messages).all();
    const sessAfter = archive.db.select().from(sessions).all();

    expect(rawAfter.length).toBeGreaterThanOrEqual(rawBefore.length);
    expect(msgAfter.length).toBeGreaterThanOrEqual(msgBefore.length);
    expect(sessAfter.length).toBe(sessBefore.length);
    for (const r of rawBefore) {
      expect(rawAfter.some((a) => a.id === r.id)).toBe(true);
    }
  });
});
