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
    expect(body.sessions).toHaveLength(3);
    expect(body.sessions[0]).toHaveProperty("id");
    expect(body.sessions[0]).toHaveProperty("title");
    expect(body.sessions[0]).toHaveProperty("project");
    expect(body.sessions[0]).toHaveProperty("createdAt");
    expect(body.sessions[0]).toHaveProperty("updatedAt");
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
