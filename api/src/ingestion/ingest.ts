import fs from "node:fs";
import type { ArchiveRepository } from "../archive/repository.js";
import type { CheckpointRepository } from "../checkpoint/repository.js";
import type { AgentPlugin, PluginEnv } from "../plugins/types.js";

export interface IngestOptions {
  plugins: readonly AgentPlugin[];
  archive: ArchiveRepository;
  checkpoint: CheckpointRepository;
  env: PluginEnv;
  now?: () => Date;
}

export interface IngestResult {
  scanned: number;
  rawInserted: number;
  normalizedUpserted: number;
  skippedByMtime: number;
}

export async function runIngestion(opts: IngestOptions): Promise<IngestResult> {
  const now = opts.now ?? (() => new Date());
  const result: IngestResult = {
    scanned: 0,
    rawInserted: 0,
    normalizedUpserted: 0,
    skippedByMtime: 0,
  };

  for (const plugin of opts.plugins) {
    for await (const ref of plugin.discover(opts.env)) {
      result.scanned += 1;

      const stat = safeStat(ref.sourcePath);
      const prior = opts.checkpoint.getScanState(plugin.id, ref.sourceId);

      opts.archive.ensureChat(
        plugin.id,
        ref.sourceId,
        now(),
        ref.project,
        ref.projectPath
      );

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
        const { id: rawId, inserted } = opts.archive.insertRawMessage({
          agent: plugin.id,
          sourceId: ref.sourceId,
          sourcePath: raw.sourcePath,
          sourceLocator: raw.sourceLocator,
          payload: raw.payload,
          ingestedAt: now(),
        });
        if (inserted) result.rawInserted += 1;

        const normalized = plugin.normalize(raw);
        if (!normalized) continue;

        const upserted = opts.archive.upsertNormalizedMessage({
          agent: plugin.id,
          sourceId: ref.sourceId,
          message: normalized,
          rawId,
        });
        if (upserted) result.normalizedUpserted += 1;
      }

      if (stat) {
        opts.checkpoint.recordScanState(
          plugin.id,
          ref.sourceId,
          ref.sourcePath,
          { mtimeMs: stat.mtimeMs, sizeBytes: stat.size },
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
