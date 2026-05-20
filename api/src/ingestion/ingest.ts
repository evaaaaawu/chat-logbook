import crypto from "node:crypto";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import type { ArchiveRepository } from "../archive/repository.js";
import {
  chats,
  chatScanState,
  messages,
  rawMessages,
} from "../archive/schema.js";
import type {
  AgentPlugin,
  CanonicalMessage,
  PluginEnv,
} from "../plugins/types.js";

export interface IngestOptions {
  plugins: readonly AgentPlugin[];
  archive: ArchiveRepository;
  env: PluginEnv;
  now?: () => Date;
}

export interface IngestResult {
  scanned: number;
  rawInserted: number;
  canonicalUpserted: number;
  skippedByMtime: number;
}

export async function runIngestion(opts: IngestOptions): Promise<IngestResult> {
  const now = opts.now ?? (() => new Date());
  const result: IngestResult = {
    scanned: 0,
    rawInserted: 0,
    canonicalUpserted: 0,
    skippedByMtime: 0,
  };

  for (const plugin of opts.plugins) {
    for await (const ref of plugin.discover(opts.env)) {
      result.scanned += 1;

      const stat = safeStat(ref.sourcePath);
      const prior = opts.archive.db
        .select()
        .from(chatScanState)
        .where(
          and(
            eq(chatScanState.agent, plugin.id),
            eq(chatScanState.sourceId, ref.sourceId)
          )
        )
        .get();

      ensureChat(opts.archive, plugin.id, ref.sourceId, now(), ref.project);

      if (
        stat &&
        prior &&
        prior.lastMtimeMs === stat.mtimeMs &&
        prior.lastSizeBytes === stat.size
      ) {
        result.skippedByMtime += 1;
        continue;
      }

      for await (const raw of plugin.extractRaw(ref)) {
        const payloadJson = JSON.stringify(raw.payload);
        const payloadHash = crypto
          .createHash("sha256")
          .update(payloadJson)
          .digest("hex");

        const existing = opts.archive.db
          .select({ id: rawMessages.id })
          .from(rawMessages)
          .where(
            and(
              eq(rawMessages.agent, plugin.id),
              eq(rawMessages.sourceId, ref.sourceId),
              eq(rawMessages.payloadHash, payloadHash)
            )
          )
          .get();

        let rawId: number;
        if (existing) {
          rawId = existing.id;
        } else {
          const inserted = opts.archive.db
            .insert(rawMessages)
            .values({
              agent: plugin.id,
              sourceId: ref.sourceId,
              sourcePath: raw.sourcePath,
              sourceLocator: raw.sourceLocator,
              rawPayload: payloadJson,
              payloadHash,
              ingestedAt: now(),
            })
            .returning({ id: rawMessages.id })
            .get();
          rawId = inserted.id;
          result.rawInserted += 1;
        }

        const canonical = plugin.normalize(raw);
        if (!canonical) continue;

        const upserted = upsertCanonical(
          opts.archive,
          plugin.id,
          ref.sourceId,
          canonical,
          rawId
        );
        if (upserted) result.canonicalUpserted += 1;
      }

      if (stat) {
        recordScanState(
          opts.archive,
          plugin.id,
          ref.sourceId,
          ref.sourcePath,
          stat,
          now()
        );
      }
    }
  }

  return result;
}

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function recordScanState(
  archive: ArchiveRepository,
  agent: string,
  sourceId: string,
  sourcePath: string,
  stat: fs.Stats,
  scannedAt: Date
): void {
  const existing = archive.db
    .select({ id: chatScanState.id })
    .from(chatScanState)
    .where(
      and(eq(chatScanState.agent, agent), eq(chatScanState.sourceId, sourceId))
    )
    .get();

  if (existing) {
    archive.db
      .update(chatScanState)
      .set({
        sourcePath,
        lastMtimeMs: stat.mtimeMs,
        lastSizeBytes: stat.size,
        lastScannedAt: scannedAt,
      })
      .where(eq(chatScanState.id, existing.id))
      .run();
  } else {
    archive.db
      .insert(chatScanState)
      .values({
        agent,
        sourceId,
        sourcePath,
        lastMtimeMs: stat.mtimeMs,
        lastSizeBytes: stat.size,
        lastScannedAt: scannedAt,
      })
      .run();
  }
}

function ensureChat(
  archive: ArchiveRepository,
  agent: string,
  sourceId: string,
  firstSeenAt: Date,
  project: string | undefined
): string {
  const existing = archive.db
    .select()
    .from(chats)
    .where(and(eq(chats.agent, agent), eq(chats.sourceId, sourceId)))
    .get();
  if (existing) {
    if (project && existing.project !== project) {
      archive.db
        .update(chats)
        .set({ project })
        .where(eq(chats.id, existing.id))
        .run();
    }
    return existing.id;
  }

  const id = crypto.randomUUID();
  const chatId = archive.generateChatId();
  archive.db
    .insert(chats)
    .values({
      id,
      chatId,
      agent,
      sourceId,
      firstSeenAt,
      project: project ?? null,
    })
    .run();
  return id;
}

function upsertCanonical(
  archive: ArchiveRepository,
  agent: string,
  sourceId: string,
  msg: CanonicalMessage,
  rawId: number
): boolean {
  const existing = archive.db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.agent, agent),
        eq(messages.sourceId, sourceId),
        eq(messages.messageId, msg.messageId)
      )
    )
    .get();

  const ts = parseTs(msg.ts);

  if (!existing) {
    archive.db
      .insert(messages)
      .values({
        agent,
        sourceId,
        messageId: msg.messageId,
        role: msg.role,
        ts,
        text: msg.text,
        blocks: msg.blocks,
        rawId,
      })
      .run();
    return true;
  }

  if (ts.getTime() >= existing.ts.getTime()) {
    archive.db
      .update(messages)
      .set({
        role: msg.role,
        ts,
        text: msg.text,
        blocks: msg.blocks,
        rawId,
      })
      .where(eq(messages.id, existing.id))
      .run();
    return true;
  }

  return false;
}

function parseTs(ts: string): Date {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return new Date(0);
  return d;
}
