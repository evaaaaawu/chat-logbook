import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import updateNotifier from "update-notifier";
import { createApp } from "./app.js";
import { createArchiveRepository } from "./archive/repository.js";
import { createCheckpointRepository } from "./checkpoint/repository.js";
import { createMetadataRepository } from "./metadata/repository.js";
import { createTagRepository } from "./metadata/tags.js";
import { startIngestionInBackground } from "./ingestion/background.js";
import { runRenormalizeIfStale } from "./ingestion/renormalize.js";
import { startWatcher } from "./ingestion/watcher.js";
import { plugins } from "./plugins/registry.js";
import { parseCliArgs } from "./cli/argv.js";
import { helpText } from "./cli/help.js";
import { resolveDataDir } from "./config/data-dir.js";
import { createChatPageQuery } from "./list-pagination.js";
import { createChatCountsQuery } from "./list-counts.js";
import { createListEventHub } from "./list-events.js";
import { reconcileTitleSortKeys } from "./metadata/reconcile-title-sort-keys.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, "../../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
  name: string;
  version: string;
};

const action = parseCliArgs(process.argv.slice(2), {
  PORT: process.env.PORT,
});
if (action.kind === "version") {
  console.log(pkg.version);
  process.exit(0);
}
if (action.kind === "help") {
  process.stdout.write(helpText);
  process.exit(0);
}
if (action.kind === "error") {
  console.error(action.message);
  process.exit(1);
}

updateNotifier({ pkg }).notify({ defer: false, isGlobal: true });

const dataDir = resolveDataDir(
  { CHAT_LOGBOOK_DATA_DIR: process.env.CHAT_LOGBOOK_DATA_DIR },
  os.homedir()
);
const webDistDir = path.join(__dirname, "../../web/dist");
const port = action.port;

const archive = createArchiveRepository({ dataDir });
// Rebuild the Normalized layer from Raw when the archive is behind the current
// normalize-output version, so a new block kind reaches already-archived,
// dormant chats without re-reading Source (ADR-0023). Runs once per bump; an
// up-to-date archive is a no-op. A failure here must not stop the server — the
// existing normalized rows still serve.
try {
  runRenormalizeIfStale({ plugins, archive });
} catch (err) {
  console.error("[renormalize] startup pass failed:", err);
}
const checkpoint = createCheckpointRepository({ dataDir });
const metadata = createMetadataRepository({ dataDir });
const tags = createTagRepository({ dataDir });
// The page query owns its own Archive connection with metadata.db ATTACHed
// read-only; it lives for the process lifetime (ADR-0017).
const pageQuery = createChatPageQuery({ dataDir });
// The counts query shares the same cross-store ATTACH shape and process
// lifetime (issue #131 Phase A).
const countsQuery = createChatCountsQuery({ dataDir });
// The in-process hub fans each ingest pass out to connected SSE clients so the
// loaded list window reconciles on a server push instead of a periodic refetch
// (issue #132). It lives for the process lifetime.
const listEvents = createListEventHub();
const app = createApp({
  archive,
  metadata,
  tags,
  pageQuery,
  countsQuery,
  listEvents,
  webDistDir,
});

const initialIngest = startIngestionInBackground({
  plugins,
  archive,
  checkpoint,
  env: { homeDir: os.homedir() },
});

// Keep the denormalized Title sort keys in step with the Archive (ADR-0019).
// archive.db and metadata.db share no transaction, so reconcile after each
// ingest pass backfills any missing/changed key row; the writes are idempotent.
function reconcileTitles(): void {
  try {
    reconcileTitleSortKeys({ archive, metadata });
  } catch (err) {
    console.error("[title-sort-key] reconcile failed:", err);
  }
}

const watcher = startWatcher({
  plugins,
  archive,
  checkpoint,
  env: { homeDir: os.homedir() },
  // Each watcher-driven ingest can add a chat or change a first user message;
  // refresh the Title keys so the Title axis stays current, then push a
  // `changed` event so connected clients reconcile their loaded window (#132).
  // The event names the chats this pass wrote to so a client showing one
  // conversation re-reads only when its chat changed (#189).
  onIngest: (result) => {
    reconcileTitles();
    listEvents.publish({ type: "changed", chatIds: result.changedChatIds });
  },
});
// Don't start watching until the initial scan has populated the checkpoint store
// (chat_scan_state); otherwise a `change` event could race the first scan and
// re-ingest from scratch. The initial scan's own keys are backfilled once it
// settles (this also serves the one-time startup backfill for seeded data).
void initialIngest.done
  .then(() => {
    reconcileTitles();
    return watcher.ready;
  })
  .catch(() => {});

function shutdown(): void {
  void watcher.close().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}

const server = serve({ fetch: app.fetch, port }, (info: { port: number }) => {
  const url = `http://localhost:${info.port}`;
  console.log(`chat-logbook is running at \x1b[36m${url}\x1b[0m`);
  if (action.open) openBrowser(url);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Try a different port:\n\n  chat-log --port 8080\n  PORT=8080 chat-log\n`
    );
    process.exit(1);
  }
  throw err;
});
