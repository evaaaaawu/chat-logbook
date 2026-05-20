/**
 * Build a v0.7.1-shaped pair of databases (archive.db + data.db) seeded with
 * representative rows. Run once, then commit the resulting *.db files. The
 * fixture is the frozen artifact; this script exists for reproducibility.
 *
 * Usage: pnpm tsx api/test-fixtures/v0.7.1/build.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

function hashMigration(folder: string, tag: string): string {
  const sql = fs.readFileSync(path.join(folder, `${tag}.sql`)).toString();
  return crypto.createHash("sha256").update(sql).digest("hex");
}

function loadJournalTags(folder: string): { tag: string; when: number }[] {
  const journal = JSON.parse(
    fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")
  ) as { entries: { tag: string; when: number }[] };
  return journal.entries.map((e) => ({ tag: e.tag, when: e.when }));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const archivePath = path.join(here, "archive.db");
const dataPath = path.join(here, "data.db");

for (const p of [archivePath, dataPath]) {
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const archive = new Database(archivePath);
archive.exec(`
CREATE TABLE archive_meta (
  id integer PRIMARY KEY NOT NULL,
  archive_uuid text NOT NULL,
  created_at integer NOT NULL
);
CREATE TABLE schema_version (
  version integer PRIMARY KEY NOT NULL,
  applied_at integer NOT NULL
);
CREATE TABLE sessions (
  id text PRIMARY KEY NOT NULL,
  short_code text NOT NULL,
  agent text NOT NULL,
  source_session_id text NOT NULL,
  first_seen_at integer NOT NULL,
  project text
);
CREATE UNIQUE INDEX sessions_short_code_unique ON sessions (short_code);
CREATE UNIQUE INDEX sessions_agent_source_idx ON sessions (agent, source_session_id);
CREATE TABLE raw_messages (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  agent text NOT NULL,
  session_id text NOT NULL,
  source_path text NOT NULL,
  source_locator text NOT NULL,
  raw_payload text NOT NULL,
  payload_hash text NOT NULL,
  ingested_at integer NOT NULL
);
CREATE UNIQUE INDEX raw_messages_idem_idx ON raw_messages (agent, session_id, payload_hash);
CREATE TABLE messages (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  agent text NOT NULL,
  session_id text NOT NULL,
  message_id text NOT NULL,
  role text NOT NULL,
  ts integer NOT NULL,
  text text NOT NULL,
  blocks text NOT NULL,
  raw_id integer NOT NULL,
  FOREIGN KEY (raw_id) REFERENCES raw_messages(id) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX messages_canonical_idx ON messages (agent, session_id, message_id);
CREATE TABLE session_scan_state (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  agent text NOT NULL,
  session_id text NOT NULL,
  source_path text NOT NULL,
  last_mtime_ms integer NOT NULL,
  last_size_bytes integer NOT NULL,
  last_scanned_at integer NOT NULL
);
CREATE UNIQUE INDEX session_scan_state_idx ON session_scan_state (agent, session_id);
CREATE TABLE ingestion_events (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  agent text NOT NULL,
  session_id text NOT NULL,
  source_path text NOT NULL,
  event_type text NOT NULL,
  detail text NOT NULL,
  observed_at integer NOT NULL
);
CREATE TABLE __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash text NOT NULL,
  created_at numeric
);
`);

const t0 = 1700000000000;
archive
  .prepare(
    "INSERT INTO archive_meta (id, archive_uuid, created_at) VALUES (?, ?, ?)"
  )
  .run(1, "fixture-archive-uuid-0001", t0);

const archiveMigrationsFolder = path.join(here, "../../drizzle/archive");
const archiveTags = loadJournalTags(archiveMigrationsFolder);
const insertDrizzle = archive.prepare(
  "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)"
);
const insertVersion = archive.prepare(
  "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)"
);
archiveTags.forEach(({ tag, when }, i) => {
  const id = i + 1;
  insertDrizzle.run(id, hashMigration(archiveMigrationsFolder, tag), when);
  insertVersion.run(id, when);
});

const sessionsSeed = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    short_code: "AAAA1111",
    agent: "claude-code",
    source_session_id: "source-session-a",
    first_seen_at: t0 + 10_000,
    project: "/Users/eva/projects/foo",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    short_code: "BBBB2222",
    agent: "claude-code",
    source_session_id: "source-session-b",
    first_seen_at: t0 + 20_000,
    project: null,
  },
];
const insertSession = archive.prepare(
  "INSERT INTO sessions (id, short_code, agent, source_session_id, first_seen_at, project) VALUES (?, ?, ?, ?, ?, ?)"
);
for (const s of sessionsSeed) {
  insertSession.run(
    s.id,
    s.short_code,
    s.agent,
    s.source_session_id,
    s.first_seen_at,
    s.project
  );
}

const insertRaw = archive.prepare(
  "INSERT INTO raw_messages (agent, session_id, source_path, source_locator, raw_payload, payload_hash, ingested_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
const insertMsg = archive.prepare(
  "INSERT INTO messages (agent, session_id, message_id, role, ts, text, blocks, raw_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
const rawA1 = insertRaw.run(
  "claude-code",
  "source-session-a",
  "/Users/eva/.claude/projects/foo/source-session-a.jsonl",
  "line:1",
  JSON.stringify({ role: "user", text: "hello" }),
  "hash-a-1",
  t0 + 11_000
).lastInsertRowid as number | bigint;
const rawA2 = insertRaw.run(
  "claude-code",
  "source-session-a",
  "/Users/eva/.claude/projects/foo/source-session-a.jsonl",
  "line:2",
  JSON.stringify({ role: "assistant", text: "hi back" }),
  "hash-a-2",
  t0 + 12_000
).lastInsertRowid as number | bigint;
const rawB1 = insertRaw.run(
  "claude-code",
  "source-session-b",
  "/Users/eva/.claude/projects/bar/source-session-b.jsonl",
  "line:1",
  JSON.stringify({ role: "user", text: "another chat" }),
  "hash-b-1",
  t0 + 21_000
).lastInsertRowid as number | bigint;

insertMsg.run(
  "claude-code",
  "source-session-a",
  "msg-a-1",
  "user",
  t0 + 11_000,
  "hello",
  JSON.stringify([{ type: "text", text: "hello" }]),
  Number(rawA1)
);
insertMsg.run(
  "claude-code",
  "source-session-a",
  "msg-a-2",
  "assistant",
  t0 + 12_000,
  "hi back",
  JSON.stringify([{ type: "text", text: "hi back" }]),
  Number(rawA2)
);
insertMsg.run(
  "claude-code",
  "source-session-b",
  "msg-b-1",
  "user",
  t0 + 21_000,
  "another chat",
  JSON.stringify([{ type: "text", text: "another chat" }]),
  Number(rawB1)
);

const insertScan = archive.prepare(
  "INSERT INTO session_scan_state (agent, session_id, source_path, last_mtime_ms, last_size_bytes, last_scanned_at) VALUES (?, ?, ?, ?, ?, ?)"
);
insertScan.run(
  "claude-code",
  "source-session-a",
  "/Users/eva/.claude/projects/foo/source-session-a.jsonl",
  t0 + 12_500,
  4096,
  t0 + 13_000
);
insertScan.run(
  "claude-code",
  "source-session-b",
  "/Users/eva/.claude/projects/bar/source-session-b.jsonl",
  t0 + 21_500,
  2048,
  t0 + 22_000
);

const insertEvent = archive.prepare(
  "INSERT INTO ingestion_events (agent, session_id, source_path, event_type, detail, observed_at) VALUES (?, ?, ?, ?, ?, ?)"
);
insertEvent.run(
  "claude-code",
  "source-session-a",
  "/Users/eva/.claude/projects/foo/source-session-a.jsonl",
  "discovered",
  JSON.stringify({ note: "first scan" }),
  t0 + 10_500
);

archive.close();

const data = new Database(dataPath);
data.exec(`
CREATE TABLE sessions_meta (
  id text PRIMARY KEY NOT NULL,
  is_deleted integer DEFAULT false NOT NULL,
  custom_title text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE TABLE __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash text NOT NULL,
  created_at numeric
);
PRAGMA user_version = 4;
`);
const dataMigrationsFolder = path.join(here, "../../drizzle");
const dataTags = loadJournalTags(dataMigrationsFolder);
const insertMetaDrizzle = data.prepare(
  "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)"
);
dataTags.forEach(({ tag, when }, i) => {
  insertMetaDrizzle.run(i + 1, hashMigration(dataMigrationsFolder, tag), when);
});

const insertMeta = data.prepare(
  "INSERT INTO sessions_meta (id, is_deleted, custom_title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
);
insertMeta.run(
  "11111111-1111-1111-1111-111111111111",
  0,
  "First chat about foo",
  t0 + 30_000,
  t0 + 30_000
);
insertMeta.run(
  "22222222-2222-2222-2222-222222222222",
  1,
  null,
  t0 + 31_000,
  t0 + 31_000
);

data.close();

console.log("Wrote fixtures:");
console.log("  ", archivePath);
console.log("  ", dataPath);
