import path from "node:path";
import { describe, it, expect } from "vitest";
import { listSessions, getSessionMessages, findSessionFile } from "./parser.js";

const fixturesDir = path.join(import.meta.dirname, "__fixtures__");

describe("listSessions", () => {
  it("returns sessions grouped by sessionId from history.jsonl", () => {
    const sessions = listSessions(fixturesDir);

    expect(sessions).toHaveLength(3);

    const session1 = sessions.find((s) => s.id === "session-1");
    expect(session1).toBeDefined();
    expect(session1!.title).toBe("Build a login page");
    expect(session1!.project).toBe("/Users/test/project-a");
    expect(session1!.createdAt).toBe(1700000000000);
    expect(session1!.updatedAt).toBe(1700000200000);

    const session2 = sessions.find((s) => s.id === "session-2");
    expect(session2).toBeDefined();
    expect(session2!.title).toBe("Fix the bug in auth");

    const session3 = sessions.find((s) => s.id === "session-3");
    expect(session3).toBeDefined();
    expect(session3!.title).toBe("Refactor the parser");
  });

  it("handles missing fields with sensible defaults", () => {
    const partialDir = path.join(fixturesDir, "..");
    const sessions = listSessions(
      path.join(import.meta.dirname, "__fixtures__"),
      "history-partial.jsonl"
    );

    expect(sessions).toHaveLength(4);

    const noDisplay = sessions.find((s) => s.id === "session-2");
    expect(noDisplay!.title).toBe("Untitled");

    const noProject = sessions.find((s) => s.id === "session-3");
    expect(noProject!.project).toBe("");

    const noTimestamp = sessions.find((s) => s.id === "session-4");
    expect(noTimestamp!.createdAt).toBe(0);
    expect(noTimestamp!.updatedAt).toBe(0);
  });

  it("returns empty array when history file does not exist", () => {
    const sessions = listSessions("/nonexistent/path");
    expect(sessions).toEqual([]);
  });
});

describe("getSessionMessages", () => {
  const sessionPath = path.join(
    fixturesDir,
    "projects",
    "project-a",
    "session-1.jsonl"
  );

  it("returns only user and assistant messages, filtering out meta, progress, system, and snapshots", () => {
    const messages = getSessionMessages(sessionPath);

    // Should have: 1 user + 3 assistant = 4 (meta user filtered, tool_result user kept)
    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role === "assistant");

    expect(userMessages).toHaveLength(2);
    expect(assistantMessages).toHaveLength(3);

    // First user message should be the real one, not the meta one
    expect(userMessages[0].content).toBe("Build a login page");
  });

  it("preserves content block types for assistant messages", () => {
    const messages = getSessionMessages(sessionPath);
    const assistantMessages = messages.filter((m) => m.role === "assistant");

    // First assistant has text block
    expect(assistantMessages[0].content).toEqual([
      { type: "text", text: "Sure, I'll build a login page for you." },
    ]);

    // Second assistant has thinking + text blocks
    expect(assistantMessages[1].content).toEqual([
      { type: "thinking", thinking: "Let me think about this..." },
      { type: "text", text: "Here's the implementation." },
    ]);

    // Third assistant has tool_use block
    expect(assistantMessages[2].content).toEqual([
      {
        type: "tool_use",
        id: "tool-1",
        name: "Read",
        input: { file_path: "src/index.ts" },
      },
    ]);
  });

  it("returns empty array when session file does not exist", () => {
    const messages = getSessionMessages("/nonexistent/session.jsonl");
    expect(messages).toEqual([]);
  });
});

describe("findSessionFile", () => {
  it("finds a session file by scanning all project subdirectories", () => {
    const result = findSessionFile(fixturesDir, "session-1");
    expect(result).toBe(
      path.join(fixturesDir, "projects", "project-a", "session-1.jsonl")
    );
  });

  it("returns null when session file does not exist", () => {
    const result = findSessionFile(fixturesDir, "nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when projects directory does not exist", () => {
    const result = findSessionFile("/nonexistent/path", "session-1");
    expect(result).toBeNull();
  });
});
