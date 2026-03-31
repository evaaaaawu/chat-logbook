import path from "node:path";
import { describe, it, expect } from "vitest";
import { createApp } from "./app.js";
import type { Session, Message } from "./parser.js";

const fixturesDir = path.join(import.meta.dirname, "__fixtures__");

describe("GET /api/sessions", () => {
  it("returns a list of sessions", async () => {
    const app = createApp(fixturesDir);
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
    const app = createApp(fixturesDir);
    const res = await app.request("/api/sessions");
    const body = (await res.json()) as { sessions: Session[] };

    // Fixture has 3 sessions in history.jsonl, but only session-1 has a JSONL file
    const ids = body.sessions.map((s) => s.id);
    expect(ids).toContain("session-1");
    expect(ids).not.toContain("session-2");
    expect(ids).not.toContain("session-3");
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns messages for an existing session", async () => {
    const app = createApp(fixturesDir);
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
    const app = createApp(fixturesDir);
    const res = await app.request("/api/sessions/nonexistent");

    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBeDefined();
  });
});
