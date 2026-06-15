import chokidar, { type FSWatcher, type ChokidarOptions } from "chokidar";
import type { ArchiveRepository } from "../archive/repository.js";
import { ingestionEvents } from "../archive/schema.js";
import type { CheckpointRepository } from "../checkpoint/repository.js";
import type { AgentPlugin, PluginEnv, ChatRef } from "../plugins/types.js";
import { runIngestion, type IngestResult } from "./ingest.js";

export interface WatcherOptions {
  plugins: readonly AgentPlugin[];
  archive: ArchiveRepository;
  checkpoint: CheckpointRepository;
  env: PluginEnv;
  debounceMs?: number;
  chokidarOptions?: ChokidarOptions;
  onError?: (err: unknown) => void;
  /**
   * Called after each debounced ingest cycle settles. An observability seam:
   * production may use it for logging/metrics, tests to synchronize on the
   * real detect → ingest path without racing wall-clock timers.
   */
  onIngest?: (result: IngestResult) => void;
}

export interface IngestionWatcher {
  ready: Promise<void>;
  close(): Promise<void>;
  /**
   * Drive a change for `path` through the same handler chokidar's "change"
   * event triggers — real debounce → ingest → archive write. Lets callers
   * (and tests) re-ingest a known-changed path deterministically, without
   * depending on chokidar's filesystem polling to notice it. No-op until
   * `ready` resolves.
   */
  notifyChange(path: string): void;
  /**
   * Drive an unlink for `path` through the same handler chokidar's "unlink"
   * event triggers — real `recordUnlink` → audit write. The unlink counterpart
   * of `notifyChange`: lets callers (and tests) record an unlink_observed audit
   * row deterministically, without depending on chokidar's filesystem polling
   * to notice the removal. No-op until `ready` resolves.
   */
  notifyUnlink(path: string): void;
}

interface PathBinding {
  plugin: AgentPlugin;
  ref: ChatRef;
}

export function startWatcher(opts: WatcherOptions): IngestionWatcher {
  const debounceMs = opts.debounceMs ?? 150;
  const onError =
    opts.onError ??
    ((err: unknown) => {
      console.warn("[watcher] error:", err);
    });

  const pathBindings = new Map<string, PathBinding>();
  const pendingTimers = new Map<string, NodeJS.Timeout>();
  let watcher: FSWatcher | null = null;
  let closed = false;

  const ready = (async () => {
    const watchPathSet = new Set<string>();
    for (const plugin of opts.plugins) {
      for await (const ref of plugin.discover(opts.env)) {
        for (const p of ref.watchPaths) {
          pathBindings.set(p, { plugin, ref });
          watchPathSet.add(p);
        }
      }
    }

    const paths = Array.from(watchPathSet);
    if (paths.length === 0) return;

    watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
      ...opts.chokidarOptions,
    });

    watcher.on("change", (p) => scheduleIngest(p));
    watcher.on("add", (p) => scheduleIngest(p));
    watcher.on("unlink", (p) => recordUnlink(p));
    watcher.on("error", (err) => onError(err));

    await new Promise<void>((resolve) => {
      watcher!.once("ready", () => resolve());
    });
  })();

  function recordUnlink(removedPath: string): void {
    if (closed) return;
    const binding = pathBindings.get(removedPath);
    if (!binding) return;
    try {
      opts.archive.db
        .insert(ingestionEvents)
        .values({
          agent: binding.plugin.id,
          sourceId: binding.ref.sourceId,
          sourcePath: removedPath,
          eventType: "unlink_observed",
          detail: { path: removedPath },
          observedAt: new Date(),
        })
        .run();
    } catch (err) {
      onError(err);
    }
  }

  function scheduleIngest(changedPath: string): void {
    if (closed) return;
    const existing = pendingTimers.get(changedPath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pendingTimers.delete(changedPath);
      void runIngestion({
        plugins: opts.plugins,
        archive: opts.archive,
        checkpoint: opts.checkpoint,
        env: opts.env,
      })
        .then((result) => opts.onIngest?.(result))
        .catch((err) => onError(err));
    }, debounceMs);
    pendingTimers.set(changedPath, timer);
  }

  return {
    ready,
    notifyChange(path: string) {
      // Route through chokidar's own emitter so the real "change" wiring runs;
      // fall back to the handler directly if the watcher isn't up yet.
      if (watcher) watcher.emit("change", path);
      else scheduleIngest(path);
    },
    notifyUnlink(path: string) {
      // Route through chokidar's own emitter so the real "unlink" wiring runs;
      // fall back to the handler directly if the watcher isn't up yet.
      if (watcher) watcher.emit("unlink", path);
      else recordUnlink(path);
    },
    async close() {
      closed = true;
      for (const t of pendingTimers.values()) clearTimeout(t);
      pendingTimers.clear();
      if (watcher) await watcher.close();
    },
  };
}
