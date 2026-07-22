import type { ArchiveRepository } from "../archive/repository.js";
import type { AgentPlugin, RawRecord } from "../plugins/types.js";

export interface RenormalizeOptions {
  plugins: readonly AgentPlugin[];
  archive: ArchiveRepository;
}

export interface RenormalizeResult {
  /** Raw rows read. */
  scanned: number;
  /** Normalized rows (re)written. */
  normalizedUpserted: number;
}

/**
 * Rebuild the Normalized layer from the Raw layer, in place. Every raw row is
 * re-parsed by its Agent's plugin and upserted over the existing normalized row
 * (last-write-wins by ts, so re-running is idempotent). Source is never read and
 * the Raw rows are never written — this is the contract's "parser fixes are a
 * re-ingest, not a migration" (ADR-0004/0023). It is how a normalize-output
 * change (a new block kind) reaches already-archived, dormant chats.
 */
export function renormalizeFromRaw({
  plugins,
  archive,
}: RenormalizeOptions): RenormalizeResult {
  const pluginById = new Map(plugins.map((p) => [p.id, p]));
  const result: RenormalizeResult = { scanned: 0, normalizedUpserted: 0 };

  for (const raw of archive.read.listRawMessages()) {
    result.scanned += 1;
    const plugin = pluginById.get(raw.agent);
    if (!plugin) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(raw.rawPayload);
    } catch {
      continue; // A raw row that no longer parses is left as-is.
    }

    const record: RawRecord = {
      sourceId: raw.sourceId,
      sourcePath: raw.sourcePath,
      // Re-normalize works entirely off the stored payload; the plugin does not
      // read the file, so a synthetic locator is enough.
      sourceLocator: "renormalize",
      payload,
    };
    const normalized = plugin.normalize(record);
    if (!normalized) continue;

    const upserted = archive.upsertNormalizedMessage({
      agent: raw.agent,
      sourceId: raw.sourceId,
      message: normalized,
      rawId: raw.id,
    });
    if (upserted) result.normalizedUpserted += 1;
  }

  return result;
}

/**
 * The current normalize-output version. Bump this whenever a plugin's normalize
 * output changes (a new block kind, a translated markup) so startup re-normalizes
 * archived chats up to the new shape. #191 introduces the `command` block, so the
 * first version that needs a re-normalize pass is 1. #194 adds the `system`
 * block, turning archived harness noise into collapsed rows: version 2. #195
 * captures the per-message `model`, backfilling it onto archived rows: version 3.
 * #196 adds the `image` block, making pasted screenshots visible in chats that
 * dropped them at ingest: version 4. #230 draws SVG visualize widgets as images
 * too, so archived diagrams stop hiding behind a collapsed tool row: version 5.
 * #197 translates `@` file mentions into `file://` links, turning them into
 * chips in chats archived before the rule existed: version 6. #234 captures the
 * per-message reasoning `effort`, backfilling it onto archived rows: version 7.
 */
export const NORMALIZE_VERSION = 7;

export interface RunRenormalizeIfStaleOptions {
  plugins: readonly AgentPlugin[];
  archive: ArchiveRepository;
  /** Defaults to NORMALIZE_VERSION; overridable in tests. */
  targetVersion?: number;
}

/**
 * Re-normalize from Raw only when the archive is behind `targetVersion`, then
 * stamp it forward. Runs once per version bump — a boot on an up-to-date archive
 * is a no-op — so the whole archive is not re-normalized on every start. Returns
 * whether a pass ran.
 */
export function runRenormalizeIfStale({
  plugins,
  archive,
  targetVersion = NORMALIZE_VERSION,
}: RunRenormalizeIfStaleOptions): boolean {
  if (archive.getNormalizeVersion() >= targetVersion) return false;
  renormalizeFromRaw({ plugins, archive });
  archive.setNormalizeVersion(targetVersion);
  return true;
}
