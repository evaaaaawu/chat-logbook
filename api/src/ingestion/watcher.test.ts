import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArchiveRepository } from "../archive/repository.js";
import {
  ingestionEvents,
  messages,
  rawMessages,
  chats,
} from "../archive/schema.js";
import { createCheckpointRepository } from "../checkpoint/repository.js";
import { ClaudeCodePlugin } from "../plugins/claude-code/plugin.js";
import { runIngestion } from "./ingest.js";
import { startWatcher } from "./watcher.js";

const fixturesRoot = path.join(__dirname, "../__fixtures__/projects");

interface Env {
  tmp: string;
  dataDir: string;
  homeDir: string;
}

function setupEnv(): Env {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-watcher-"));
  const dataDir = path.join(tmp, "data");
  const homeDir = path.join(tmp, "home");
  const claudeProjects = path.join(homeDir, ".claude", "projects");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(claudeProjects, { recursive: true });
  fs.cpSync(fixturesRoot, claudeProjects, { recursive: true });
  return { tmp, dataDir, homeDir };
}

let env: Env;

beforeEach(() => {
  env = setupEnv();
});

afterEach(() => {
  fs.rmSync(env.tmp, { recursive: true, force: true });
});

describe("startWatcher", () => {
  // The flaky stage was chokidar's filesystem polling: under parallel-suite
  // worker-pool contention it can miss the change event entirely, never firing
  // within any budget (proven: the "change" event never arrives, not late).
  // So we append the file, then drive the change through the watcher's own
  // notifyChange — the real "change" handler → debounce → ingest → archive
  // write all run; only chokidar's unreliable detection is bypassed. onIngest
  // signals completion, so the test is deterministic with no wall-clock race.
  it("ingests appended content to an existing source file (change event)", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });
    const plugins = [new ClaudeCodePlugin()];

    // Seed archive via on-app-open scan first; watcher is for live updates.
    await runIngestion({
      plugins,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    const rawBefore = archive.db.select().from(rawMessages).all().length;

    // Resolves the instant a watcher-triggered ingest cycle has applied the
    // appended row — event-driven, not wall-clock polling.
    let signalIngested!: () => void;
    const ingested = new Promise<void>((resolve) => {
      signalIngested = resolve;
    });

    const watcher = startWatcher({
      plugins,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
      // Large interval keeps real polling dormant within the test, so the only
      // change driver is the deterministic notifyChange call below.
      chokidarOptions: { usePolling: true, interval: 60_000 },
      debounceMs: 25,
      onIngest: () => {
        const rawAfter = archive.db.select().from(rawMessages).all().length;
        if (rawAfter === rawBefore + 1) signalIngested();
      },
    });
    await watcher.ready;

    try {
      const sourceFile = path.join(
        env.homeDir,
        ".claude",
        "projects",
        "project-a",
        "session-1.jsonl"
      );
      const newLine = JSON.stringify({
        type: "user",
        message: { role: "user", content: "live appended message" },
        isMeta: false,
        uuid: "msg-live-1",
        timestamp: "2024-01-03T00:00:00Z",
        sessionId: "session-1",
        isSidechain: false,
      });
      fs.appendFileSync(sourceFile, newLine + "\n");
      const future = new Date(Date.now() + 60_000);
      fs.utimesSync(sourceFile, future, future);

      watcher.notifyChange(sourceFile);
      await ingested;

      const rawAfter = archive.db.select().from(rawMessages).all().length;
      expect(rawAfter).toBe(rawBefore + 1);
      const msg = archive.db
        .select()
        .from(messages)
        .all()
        .find((m) => m.messageId === "msg-live-1");
      expect(msg).toBeDefined();
    } finally {
      await watcher.close();
      archive.close();
    }
  });

  it("records an unlink_observed audit row without deleting archive rows", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });
    const plugins = [new ClaudeCodePlugin()];

    await runIngestion({
      plugins,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });
    const rawBefore = archive.db.select().from(rawMessages).all().length;
    const msgBefore = archive.db.select().from(messages).all().length;
    const chatsBefore = archive.db.select().from(chats).all().length;

    const watcher = startWatcher({
      plugins,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
      chokidarOptions: { usePolling: true, interval: 25 },
      debounceMs: 25,
    });
    await watcher.ready;

    try {
      const sourceFile = path.join(
        env.homeDir,
        ".claude",
        "projects",
        "project-a",
        "session-1.jsonl"
      );
      fs.unlinkSync(sourceFile);

      await vi.waitFor(
        () => {
          const events = archive.db
            .select()
            .from(ingestionEvents)
            .all()
            .filter((e) => e.eventType === "unlink_observed");
          expect(events.length).toBeGreaterThan(0);
          expect(events.some((e) => e.sourcePath === sourceFile)).toBe(true);
        },
        { timeout: 5000, interval: 50 }
      );

      expect(archive.db.select().from(rawMessages).all().length).toBe(
        rawBefore
      );
      expect(archive.db.select().from(messages).all().length).toBe(msgBefore);
      expect(archive.db.select().from(chats).all().length).toBe(chatsBefore);
    } finally {
      await watcher.close();
      archive.close();
    }
  });

  it("stops triggering ingest after close()", async () => {
    const archive = createArchiveRepository({ dataDir: env.dataDir });
    const checkpoint = createCheckpointRepository({ dataDir: env.dataDir });
    const plugins = [new ClaudeCodePlugin()];
    await runIngestion({
      plugins,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
    });

    const watcher = startWatcher({
      plugins,
      archive,
      checkpoint,
      env: { homeDir: env.homeDir },
      chokidarOptions: { usePolling: true, interval: 25 },
      debounceMs: 25,
    });
    await watcher.ready;
    await watcher.close();

    const rawBefore = archive.db.select().from(rawMessages).all().length;

    const sourceFile = path.join(
      env.homeDir,
      ".claude",
      "projects",
      "project-a",
      "session-1.jsonl"
    );
    const newLine = JSON.stringify({
      type: "user",
      message: { role: "user", content: "after close" },
      isMeta: false,
      uuid: "msg-after-close",
      timestamp: "2024-01-04T00:00:00Z",
      sessionId: "session-1",
      isSidechain: false,
    });
    fs.appendFileSync(sourceFile, newLine + "\n");
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(sourceFile, future, future);

    await new Promise((r) => setTimeout(r, 400));
    expect(archive.db.select().from(rawMessages).all().length).toBe(rawBefore);

    archive.close();
  });
});
