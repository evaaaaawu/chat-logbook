import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createApp } from "./app.js";
import type { Session, Message } from "./parser.js";

const fixturesDir = path.join(import.meta.dirname, "__fixtures__");

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-app-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/sessions", () => {
  it("returns a list of sessions", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });
    const res = await app.request("/api/sessions");

    expect(res.status).toBe(200);

    const body = (await res.json()) as { sessions: Session[] };
    expect(body.sessions.length).toBeGreaterThan(0);
    expect(body.sessions[0]).toHaveProperty("id");
    expect(body.sessions[0]).toHaveProperty("title");
    expect(body.sessions[0]).toHaveProperty("project");
    expect(body.sessions[0]).toHaveProperty("createdAt");
    expect(body.sessions[0]).toHaveProperty("updatedAt");
  });

  it("excludes sessions that have no conversation file", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });
    const res = await app.request("/api/sessions");
    const body = (await res.json()) as { sessions: Session[] };

    // Fixture has 3 sessions in history.jsonl, but only session-1 has a JSONL file
    const ids = body.sessions.map((s) => s.id);
    expect(ids).toContain("session-1");
    expect(ids).not.toContain("session-2");
    expect(ids).not.toContain("session-3");
  });
});

describe("GET /api/sessions?includeDeleted=true", () => {
  it("returns deleted sessions with isDeleted flag", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });

    await app.request("/api/sessions/session-1", { method: "DELETE" });

    const res = await app.request("/api/sessions?includeDeleted=true");
    const body = (await res.json()) as {
      sessions: (Session & { isDeleted?: boolean })[];
    };

    const session1 = body.sessions.find((s) => s.id === "session-1");
    expect(session1).toBeDefined();
    expect(session1!.isDeleted).toBe(true);
  });
});

describe("DELETE /api/sessions/:id", () => {
  it("hides the session from GET /api/sessions after soft delete", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });

    const del = await app.request("/api/sessions/session-1", {
      method: "DELETE",
    });
    expect(del.status).toBe(204);

    const list = await app.request("/api/sessions");
    const body = (await list.json()) as { sessions: Session[] };
    const ids = body.sessions.map((s) => s.id);
    expect(ids).not.toContain("session-1");
  });
});

describe("POST /api/sessions/:id/restore", () => {
  it("makes a previously deleted session reappear in GET /api/sessions", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });

    await app.request("/api/sessions/session-1", { method: "DELETE" });

    const restore = await app.request("/api/sessions/session-1/restore", {
      method: "POST",
    });
    expect(restore.status).toBe(204);

    const list = await app.request("/api/sessions");
    const body = (await list.json()) as { sessions: Session[] };
    const ids = body.sessions.map((s) => s.id);
    expect(ids).toContain("session-1");
  });
});

describe("DELETE / restore idempotency", () => {
  it("returns 404 when deleting a session that does not exist in the source", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });

    const res = await app.request("/api/sessions/nonexistent", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when restoring a session that does not exist in the source", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });

    const res = await app.request("/api/sessions/nonexistent/restore", {
      method: "POST",
    });

    expect(res.status).toBe(404);
  });

  it("returns 204 when deleting an already-deleted session", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });

    const first = await app.request("/api/sessions/session-1", {
      method: "DELETE",
    });
    expect(first.status).toBe(204);

    const second = await app.request("/api/sessions/session-1", {
      method: "DELETE",
    });
    expect(second.status).toBe(204);
  });

  it("returns 204 when restoring a session that was never deleted", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });

    const res = await app.request("/api/sessions/session-1/restore", {
      method: "POST",
    });

    expect(res.status).toBe(204);
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns messages for an existing session", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });
    const res = await app.request("/api/sessions/session-1");

    expect(res.status).toBe(200);

    const body = (await res.json()) as { messages: Message[] };
    expect(body.messages).toBeDefined();
    expect(body.messages.length).toBeGreaterThan(0);

    const userMsg = body.messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toBe("Build a login page");
  });

  it("returns 404 for a nonexistent session", async () => {
    const app = createApp({ claudeDir: fixturesDir, dataDir });
    const res = await app.request("/api/sessions/nonexistent");

    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBeDefined();
  });
});
