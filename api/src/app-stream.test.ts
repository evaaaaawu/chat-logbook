import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createApp } from "./app.js";
import { createArchiveRepository } from "./archive/repository.js";
import { createMetadataRepository } from "./metadata/repository.js";
import { createTagRepository } from "./metadata/tags.js";
import { createListEventHub } from "./list-events.js";

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-logbook-stream-test-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function buildApp(listEvents?: ReturnType<typeof createListEventHub>) {
  return createApp({
    archive: createArchiveRepository({ dataDir }),
    metadata: createMetadataRepository({ dataDir }),
    tags: createTagRepository({ dataDir }),
    listEvents,
  });
}

// Read decoded chunks from an SSE body until `predicate` matches the accumulated
// text or the read times out, then cancel the reader. Returns the accumulated
// text so assertions can inspect the framed events.
async function readUntil(
  body: ReadableStream<Uint8Array>,
  predicate: (text: string) => boolean
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (!predicate(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  return text;
}

describe("GET /api/chats/stream", () => {
  it("pushes a changed event to a connected client when the hub publishes", async () => {
    const hub = createListEventHub();
    const app = buildApp(hub);

    const res = await app.request("/api/chats/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // The stream callback subscribes synchronously as streaming starts; let the
    // microtask flush, then publish and read the pushed frame.
    await new Promise((resolve) => setTimeout(resolve, 0));
    hub.publish({ type: "changed" });

    const text = await readUntil(res.body!, (t) =>
      t.includes("event: changed")
    );
    expect(text).toContain("event: changed");
  });

  it("names the changed chats in the event payload so a client can scope its re-read", async () => {
    const hub = createListEventHub();
    const app = buildApp(hub);

    const res = await app.request("/api/chats/stream");
    await new Promise((resolve) => setTimeout(resolve, 0));
    hub.publish({ type: "changed", chatIds: ["clog_abc123", "clog_def456"] });

    const text = await readUntil(res.body!, (t) => t.includes("data: {"));
    const data = text.split("data: ")[1].split("\n")[0];
    expect(JSON.parse(data)).toEqual({
      chatIds: ["clog_abc123", "clog_def456"],
    });
  });

  it("reports 501 when no live-update hub is wired", async () => {
    const app = buildApp();
    const res = await app.request("/api/chats/stream");
    expect(res.status).toBe(501);
  });
});
