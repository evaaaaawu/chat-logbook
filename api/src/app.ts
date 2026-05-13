import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { and, asc, desc, eq } from "drizzle-orm";
import type { ArchiveRepository } from "./archive/repository.js";
import {
  messages as archiveMessages,
  sessions as archiveSessions,
} from "./archive/schema.js";
import type { MetadataRepository } from "./metadata/repository.js";
import { loadSessionVisibility } from "./visibility.js";

interface AppOptions {
  archive: ArchiveRepository;
  metadata: MetadataRepository;
  webDistDir?: string;
}

interface SessionResponse {
  id: string;
  title: string;
  project: string;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
}

type ApiContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

interface MessageResponse {
  role: "user" | "assistant";
  content: ApiContentBlock[];
  timestamp: string;
}

interface StoredBlock {
  type: string;
  [key: string]: unknown;
}

function toApiBlock(block: StoredBlock): ApiContentBlock {
  if (block.type === "tool_result") {
    return {
      type: "tool_result",
      tool_use_id: String(block.toolUseId ?? ""),
      content: block.content,
    };
  }
  return block as ApiContentBlock;
}

const CLAUDE_CODE_AGENT = "claude-code";

export function createApp({ archive, metadata, webDistDir }: AppOptions) {
  const app = new Hono();

  function findArchiveSessionBySourceId(sourceSessionId: string) {
    return archive.db
      .select()
      .from(archiveSessions)
      .where(eq(archiveSessions.sourceSessionId, sourceSessionId))
      .get();
  }

  app.get("/api/sessions", (c) => {
    const visibility = loadSessionVisibility(metadata, {
      includeTrashed: c.req.query("includeTrashed") === "true",
    });

    const rows = archive.db.select().from(archiveSessions).all();
    const sessions: SessionResponse[] = [];

    for (const row of rows) {
      if (!visibility.isVisible(row.id)) continue;
      const isDeleted = visibility.isTrashed(row.id);

      const lastMessage = archive.db
        .select({ ts: archiveMessages.ts })
        .from(archiveMessages)
        .where(
          and(
            eq(archiveMessages.agent, CLAUDE_CODE_AGENT),
            eq(archiveMessages.sessionId, row.sourceSessionId)
          )
        )
        .orderBy(desc(archiveMessages.ts))
        .limit(1)
        .get();

      const session: SessionResponse = {
        id: row.sourceSessionId,
        title: deriveTitle(archive, metadata, row),
        project: row.project ?? "",
        createdAt: row.firstSeenAt.getTime(),
        updatedAt: lastMessage
          ? lastMessage.ts.getTime()
          : row.firstSeenAt.getTime(),
      };
      if (isDeleted) session.isDeleted = true;
      sessions.push(session);
    }

    return c.json({ sessions });
  });

  app.delete("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const row = findArchiveSessionBySourceId(sessionId);
    if (!row) {
      return c.json({ error: "Session not found" }, 404);
    }
    metadata.softDelete(row.id);
    return c.body(null, 204);
  });

  app.post("/api/sessions/:id/restore", (c) => {
    const sessionId = c.req.param("id");
    const row = findArchiveSessionBySourceId(sessionId);
    if (!row) {
      return c.json({ error: "Session not found" }, 404);
    }
    metadata.restore(row.id);
    return c.body(null, 204);
  });

  app.get("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const row = findArchiveSessionBySourceId(sessionId);
    if (!row) {
      return c.json({ error: "Session not found" }, 404);
    }
    const visibility = loadSessionVisibility(metadata, {
      includeTrashed: c.req.query("includeTrashed") === "true",
    });
    if (!visibility.isVisible(row.id)) {
      return c.json({ error: "Session not found" }, 404);
    }
    const rows = archive.db
      .select()
      .from(archiveMessages)
      .where(
        and(
          eq(archiveMessages.agent, CLAUDE_CODE_AGENT),
          eq(archiveMessages.sessionId, sessionId)
        )
      )
      .orderBy(asc(archiveMessages.ts))
      .all();

    const messages: MessageResponse[] = rows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: (m.blocks as StoredBlock[]).map(toApiBlock),
      timestamp: m.ts.toISOString(),
    }));

    return c.json({ messages });
  });

  function deriveTitle(
    archive: ArchiveRepository,
    metadata: MetadataRepository,
    row: { id: string; sourceSessionId: string }
  ): string {
    const custom = metadata.getCustomTitle(row.id);
    if (custom && custom.trim()) return custom;

    const firstUser = archive.db
      .select({ text: archiveMessages.text })
      .from(archiveMessages)
      .where(
        and(
          eq(archiveMessages.agent, CLAUDE_CODE_AGENT),
          eq(archiveMessages.sessionId, row.sourceSessionId),
          eq(archiveMessages.role, "user")
        )
      )
      .orderBy(asc(archiveMessages.ts))
      .limit(1)
      .get();

    const text = firstUser?.text?.trim().split("\n")[0]?.trim();
    return text && text.length > 0 ? text : "Untitled";
  }

  if (webDistDir) {
    app.use("*", serveStatic({ root: webDistDir }));
    app.use("*", serveStatic({ root: webDistDir, path: "index.html" }));
  }

  return app;
}
