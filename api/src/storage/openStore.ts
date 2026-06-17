import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export interface OpenStoreOptions<TSchema extends Record<string, unknown>> {
  dataDir: string;
  dbFile: string;
  callerUrl: string;
  migrationsSubdir: string;
  schema: TSchema;
}

export interface OpenStoreResult<TSchema extends Record<string, unknown>> {
  db: BetterSQLite3Database<TSchema>;
  sqlite: Database.Database;
}

// Resolve the migrations folder relative to the *caller*, trying the built
// layout (`../../<subdir>`) before the source layout (`./<subdir>`). The offset
// is caller-relative, so callers pass their own import.meta.url.
function resolveMigrationsFolder(
  callerUrl: string,
  migrationsSubdir: string
): string {
  const here = path.dirname(fileURLToPath(callerUrl));
  const candidates = [
    path.join(here, "../..", migrationsSubdir),
    path.join(here, ".", migrationsSubdir),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`Could not locate migrations folder "${migrationsSubdir}"`);
  }
  return found;
}

export function openStore<TSchema extends Record<string, unknown>>({
  dataDir,
  dbFile,
  callerUrl,
  migrationsSubdir,
  schema,
}: OpenStoreOptions<TSchema>): OpenStoreResult<TSchema> {
  // Resolve migrations first so a misconfigured caller fails before we create
  // the data dir or the db file.
  const migrationsFolder = resolveMigrationsFolder(callerUrl, migrationsSubdir);
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, dbFile));
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { db, sqlite };
}
