import crypto from "node:crypto";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { openStore } from "../storage/openStore.js";
import * as schema from "./schema.js";
import {
  archiveMeta,
  chats,
  ingestionEvents,
  messages,
  rawMessages,
  schemaVersion,
} from "./schema.js";
import { generateChatId } from "./chat-id.js";
import { createArchiveReadSeam, type ArchiveReadSeam } from "./read-seam.js";

export type ArchiveDb = BetterSQLite3Database<typeof schema>;

export interface InsertRawMessageInput {
  agent: string;
  sourceId: string;
  sourcePath: string;
  sourceLocator: string;
  payload: unknown;
  ingestedAt: Date;
}

export interface InsertRawMessageResult {
  id: number;
  inserted: boolean;
}

/**
 * The normalized fields the Archive persists for one message. Mirrors a
 * plugin's normalized output without coupling the store to the plugin layer.
 * `ts` arrives as an ISO string and is parsed here so the last-write-wins
 * comparison stays inside the repository.
 */
export interface NormalizedMessageInput {
  messageId: string;
  role: string;
  ts: string;
  text: string;
  blocks: unknown;
}

export interface UpsertNormalizedMessageInput {
  agent: string;
  sourceId: string;
  message: NormalizedMessageInput;
  rawId: number;
}

export interface IngestionEventInput {
  agent: string;
  sourceId: string;
  sourcePath: string;
  eventType: string;
  detail: unknown;
  /** Defaults to now when omitted. */
  observedAt?: Date;
}

export interface AppliedMigration {
  version: number;
  appliedAt: Date;
}

export interface ArchiveRepository {
  /**
   * The read seam for the Chat read path. Named read primitives the reader
   * composes into the public Chat/Message JSON, so the read path never touches
   * the raw drizzle handle.
   */
  readonly read: ArchiveReadSeam;
  getArchiveUuid(): string;
  getAppliedMigrations(): AppliedMigration[];
  generateChatId(): string;
  /**
   * Ensure a chat row exists for the canonical key `(agent, source_id)` and
   * return its internal id. On a row that already exists, fills in `project`
   * and `projectPath` when a later scan resolves values the first scan lacked.
   */
  ensureChat(
    agent: string,
    sourceId: string,
    firstSeenAt: Date,
    project?: string,
    projectPath?: string
  ): string;
  /**
   * Append a raw message, idempotent on the content key
   * `(agent, source_id, payload_hash)`. Returns the row id and whether this
   * call inserted it (`false` when an identical payload was already stored).
   * The payload hash is computed here so the idempotency key stays internal.
   */
  insertRawMessage(input: InsertRawMessageInput): InsertRawMessageResult;
  /**
   * Insert or overwrite the normalized message for the canonical key
   * `(agent, source_id, message_id)`, last-write-wins by `ts`. Returns `true`
   * when the row was written (inserted, or overwritten because the incoming
   * `ts` is at least the stored one) and `false` when an older `ts` is dropped.
   */
  upsertNormalizedMessage(input: UpsertNormalizedMessageInput): boolean;
  /**
   * Append an ingestion audit row (e.g. `unlink_observed`). Audit only — it
   * never deletes archive rows. See ADR-0002.
   */
  recordIngestionEvent(event: IngestionEventInput): void;
  close(): void;
}

interface DrizzleMigrationRow {
  id: number;
  created_at: number;
}

interface RepositoryOptions {
  dataDir: string;
}

function parseTs(ts: string): Date {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return new Date(0);
  return d;
}

export function createArchiveRepository({
  dataDir,
}: RepositoryOptions): ArchiveRepository {
  const { db, sqlite } = openStore({
    dataDir,
    dbFile: "archive.db",
    callerUrl: import.meta.url,
    migrationsSubdir: "drizzle/archive",
    schema,
  });

  const drizzleMigrations = sqlite
    .prepare("SELECT id, created_at FROM __drizzle_migrations ORDER BY id ASC")
    .all() as DrizzleMigrationRow[];
  for (const m of drizzleMigrations) {
    db.insert(schemaVersion)
      .values({ version: m.id, appliedAt: new Date(m.created_at) })
      .onConflictDoNothing()
      .run();
  }

  const existing = db.select().from(archiveMeta).get();
  if (!existing) {
    db.insert(archiveMeta)
      .values({
        id: 1,
        archiveUuid: crypto.randomUUID(),
        createdAt: new Date(),
      })
      .run();
  }

  function nextChatId(): string {
    return generateChatId({
      isTaken: (candidate) =>
        db
          .select({ id: chats.id })
          .from(chats)
          .where(eq(chats.chatId, candidate))
          .get() !== undefined,
    });
  }

  return {
    read: createArchiveReadSeam(db),
    getArchiveUuid() {
      const row = db.select().from(archiveMeta).get();
      if (!row) {
        throw new Error("archive_meta row missing after initialization");
      }
      return row.archiveUuid;
    },
    getAppliedMigrations() {
      return db
        .select()
        .from(schemaVersion)
        .all()
        .map((r) => ({ version: r.version, appliedAt: r.appliedAt }));
    },
    generateChatId() {
      return nextChatId();
    },
    ensureChat(agent, sourceId, firstSeenAt, project, projectPath) {
      const existingChat = db
        .select()
        .from(chats)
        .where(and(eq(chats.agent, agent), eq(chats.sourceId, sourceId)))
        .get();
      if (existingChat) {
        const updates: { project?: string; projectPath?: string } = {};
        if (project && existingChat.project !== project) {
          updates.project = project;
        }
        if (projectPath && existingChat.projectPath !== projectPath) {
          updates.projectPath = projectPath;
        }
        if (Object.keys(updates).length > 0) {
          db.update(chats)
            .set(updates)
            .where(eq(chats.id, existingChat.id))
            .run();
        }
        return existingChat.id;
      }

      const id = crypto.randomUUID();
      db.insert(chats)
        .values({
          id,
          chatId: nextChatId(),
          agent,
          sourceId,
          firstSeenAt,
          project: project ?? null,
          projectPath: projectPath ?? null,
        })
        .run();
      return id;
    },
    insertRawMessage(input) {
      const payloadJson = JSON.stringify(input.payload);
      const payloadHash = crypto
        .createHash("sha256")
        .update(payloadJson)
        .digest("hex");

      const existing = db
        .select({ id: rawMessages.id })
        .from(rawMessages)
        .where(
          and(
            eq(rawMessages.agent, input.agent),
            eq(rawMessages.sourceId, input.sourceId),
            eq(rawMessages.payloadHash, payloadHash)
          )
        )
        .get();
      if (existing) return { id: existing.id, inserted: false };

      const inserted = db
        .insert(rawMessages)
        .values({
          agent: input.agent,
          sourceId: input.sourceId,
          sourcePath: input.sourcePath,
          sourceLocator: input.sourceLocator,
          rawPayload: payloadJson,
          payloadHash,
          ingestedAt: input.ingestedAt,
        })
        .returning({ id: rawMessages.id })
        .get();
      return { id: inserted.id, inserted: true };
    },
    upsertNormalizedMessage({ agent, sourceId, message, rawId }) {
      const existing = db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.agent, agent),
            eq(messages.sourceId, sourceId),
            eq(messages.messageId, message.messageId)
          )
        )
        .get();

      const ts = parseTs(message.ts);

      if (!existing) {
        db.insert(messages)
          .values({
            agent,
            sourceId,
            messageId: message.messageId,
            role: message.role,
            ts,
            text: message.text,
            blocks: message.blocks,
            rawId,
          })
          .run();
        return true;
      }

      if (ts.getTime() >= existing.ts.getTime()) {
        db.update(messages)
          .set({
            role: message.role,
            ts,
            text: message.text,
            blocks: message.blocks,
            rawId,
          })
          .where(eq(messages.id, existing.id))
          .run();
        return true;
      }

      return false;
    },
    recordIngestionEvent(event) {
      db.insert(ingestionEvents)
        .values({
          agent: event.agent,
          sourceId: event.sourceId,
          sourcePath: event.sourcePath,
          eventType: event.eventType,
          detail: event.detail,
          observedAt: event.observedAt ?? new Date(),
        })
        .run();
    },
    close() {
      sqlite.close();
    },
  };
}
