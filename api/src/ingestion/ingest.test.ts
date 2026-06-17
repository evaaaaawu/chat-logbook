import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArchiveRepository } from "../archive/repository.js";
import { createCheckpointRepository } from "../checkpoint/repository.js";
import { chatScanState } from "../checkpoint/schema.js";
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

/**
 * Sum the messages of every chat through the read seam. The archive's outward
 * read surface is per-chat, so a global count is composed from `listChatRows`
 * + `listMessagesByChat` rather than a back-channel `SELECT FROM messages`.
 */
function totalMessageCount(
  archive: ReturnType<typeof createArchiveRepository>
): number {
  return archive.read
    .listChatRows()
    .reduce(
      (acc, chat) =>
        acc + archive.read.listMessagesByChat(chat.agent, chat.sourceId).length,
      0
    );
}

let env: Env;

beforeEach(() => {
  env = setupEnv();
});

afterEach(() => {
  fs.rmSync(path.dirname(env.dataDir), { recursive: true, force: true });
});

describe("runIngestion", () => {
  it("populates chats, raw messages, and normalized messages from source on first run", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });

    const result = await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    expect(result.scanned).toBeGreaterThan(0);
    expect(result.rawInserted).toBeGreaterThan(0);
    expect(result.normalizedUpserted).toBeGreaterThan(0);
    // Normalized writes can never outnumber raw rows: plugins skip some
    // payloads (meta, snapshot, sidechain) at the normalize step but write
    // them all to the raw layer.
    expect(result.normalizedUpserted).toBeLessThanOrEqual(result.rawInserted);

    const chatRows = archive.read.listChatRows();
    expect(chatRows.length).toBeGreaterThan(0);
    for (const c of chatRows) {
      expect(c.agent).toBe("claude-code");
      expect(c.chatId).toHaveLength(6);
    }

    const session1 = archive.read.findChatBySourceId("session-1");
    expect(session1?.project).toBe("project-a");
    expect(session1?.projectPath).toBe("/Users/test/project-a");

    archive.close();
  });

  it("is a no-op on second run: zero new raw rows and row counts unchanged", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });
    const pluginsList = [new ClaudeCodePlugin()];

    const first = await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    const chatsBefore = archive.read.listChatRows().length;
    const messagesBefore = totalMessageCount(archive);

    const second = await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    expect(first.rawInserted).toBeGreaterThan(0);
    expect(second.rawInserted).toBe(0);
    expect(second.normalizedUpserted).toBe(0);
    expect(archive.read.listChatRows().length).toBe(chatsBefore);
    expect(totalMessageCount(archive)).toBe(messagesBefore);

    archive.close();
  });

  it("appends a new raw row when source content at the same line changes", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });
    const pluginsList = [new ClaudeCodePlugin()];

    await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });

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
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    // Append-only at the raw layer: the changed line inserts a new raw row
    // alongside the original. ADR-0002 guarantees nothing gets overwritten.
    expect(second.rawInserted).toBe(1);

    archive.close();
  });

  it("writes raw for every payload but skips messages when normalize returns null", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });

    const result = await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    // Fixture contains file-history-snapshot, isMeta, and isSidechain rows
    // that the claude-code plugin skips at the normalize step but writes to
    // the raw layer. Strict inequality proves at least one skipped raw row.
    expect(result.normalizedUpserted).toBeLessThan(result.rawInserted);

    archive.close();
  });

  it("mtime fast path: skips files whose mtime and size are unchanged since last scan", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });

    // First run records scan state.
    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    // Track which sessions actually opened their source file on the second run.
    const opened: string[] = [];
    const observedPlugin = new ClaudeCodePlugin();
    const originalExtract = observedPlugin.extractRaw.bind(observedPlugin);
    observedPlugin.extractRaw = async function* (ref) {
      opened.push(ref.sourceId);
      yield* originalExtract(ref);
    };

    const second = await runIngestion({
      plugins: [observedPlugin],
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    expect(second.skippedByMtime).toBeGreaterThan(0);
    expect(opened).toEqual([]);
    expect(second.rawInserted).toBe(0);

    archive.close();
  });

  it("mtime fast path: re-reads a file when mtime changes", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });

    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      checkpoint,
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
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    expect(second.rawInserted).toBe(1);
    expect(second.skippedByMtime).toBe(0);

    archive.close();
  });

  it("preserves archive rows when source file is shrunk between scans", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });

    await runIngestion({
      plugins: [new ClaudeCodePlugin()],
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    const chatsBefore = archive.read.listChatRows().length;
    const messagesBefore = totalMessageCount(archive);
    expect(messagesBefore).toBeGreaterThan(0);

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
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    // Chat count unchanged and messages append-only: shrinking the source
    // never deletes archive rows (ADR-0002).
    expect(archive.read.listChatRows().length).toBe(chatsBefore);
    expect(totalMessageCount(archive)).toBeGreaterThanOrEqual(messagesBefore);
  });

  it("fills in a session's project on a later scan once cwd is resolvable", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });
    const pluginsList = [new ClaudeCodePlugin()];

    // A session whose source carries no cwd: its project is unknown.
    const projectDir = path.join(
      env.homeDir,
      ".claude",
      "projects",
      "-Users-test-late-app"
    );
    fs.mkdirSync(projectDir, { recursive: true });
    const sourceFile = path.join(projectDir, "late.jsonl");
    fs.writeFileSync(
      sourceFile,
      JSON.stringify({ type: "file-history-snapshot", messageId: "m0" }) +
        "\n" +
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "hi" },
          uuid: "u1",
          timestamp: "2024-01-01T00:00:01Z",
        }) +
        "\n"
    );

    await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    const before = archive.read.findChatBySourceId("late");
    expect(before?.project).toBeNull();

    // A later message now carries cwd (e.g. read further into the file).
    fs.appendFileSync(
      sourceFile,
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "more" },
        uuid: "u2",
        timestamp: "2024-01-01T00:00:02Z",
        cwd: "/Users/test/late-app",
      }) + "\n"
    );

    await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    const after = archive.read.findChatBySourceId("late");
    expect(after?.project).toBe("late-app");
    expect(after?.projectPath).toBe("/Users/test/late-app");

    archive.close();
  });

  it("records the scan watermark in the checkpoint store, not the archive store", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });
    const pluginsList = [new ClaudeCodePlugin()];

    const first = await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    expect(first.rawInserted).toBeGreaterThan(0);

    // The watermark lands in checkpoint.db.
    const watermarks = checkpoint.db.select().from(chatScanState).all();
    expect(watermarks.length).toBeGreaterThan(0);

    // A second scan skips unchanged files using the checkpoint store.
    const second = await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    expect(second.skippedByMtime).toBeGreaterThan(0);
    expect(second.rawInserted).toBe(0);

    archive.close();
    checkpoint.close();
  });

  it("upgrade path: a scan with an empty checkpoint but a populated archive rebuilds the watermark and is a no-op at the Raw layer", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const pluginsList = [new ClaudeCodePlugin()];

    // Pre-upgrade: archive is already populated by an earlier build's scan.
    const firstCheckpoint = createCheckpointRepository({
      dataDir: env.dataDir,
    });
    const first = await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint: firstCheckpoint,
      env: { homeDir: env.homeDir },
    });
    expect(first.rawInserted).toBeGreaterThan(0);
    const chatsBefore = archive.read.listChatRows().length;
    const messagesBefore = totalMessageCount(archive);
    firstCheckpoint.close();

    // Upgrade drops session_scan_state from the archive store; the checkpoint
    // store starts empty. Model that with a fresh, empty Checkpoint store.
    const freshDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "chat-logbook-fresh-checkpoint-")
    );
    const emptyCheckpoint = createCheckpointRepository({
      dataDir: freshDataDir,
    });
    expect(emptyCheckpoint.getScanState("claude-code", "session-1")).toBe(
      undefined
    );

    // The next Scan re-reads every file (no fast-path), but content-based
    // idempotency makes it a no-op at the Raw layer.
    const upgrade = await runIngestion({
      plugins: pluginsList,
      archive,
      checkpoint: emptyCheckpoint,
      env: { homeDir: env.homeDir },
    });

    expect(upgrade.skippedByMtime).toBe(0);
    expect(upgrade.rawInserted).toBe(0);
    // Raw layer is a no-op: chat and message counts stay where the first run
    // left them. `normalizedUpserted` may still be > 0 because last-write-wins
    // re-stamps the same payloads — that's a write, but not a new row.
    expect(archive.read.listChatRows().length).toBe(chatsBefore);
    expect(totalMessageCount(archive)).toBe(messagesBefore);
    // The watermark is rebuilt in the new checkpoint store.
    expect(
      emptyCheckpoint.getScanState("claude-code", "session-1")
    ).toBeDefined();

    archive.close();
    emptyCheckpoint.close();
    fs.rmSync(freshDataDir, { recursive: true, force: true });
  });
});
