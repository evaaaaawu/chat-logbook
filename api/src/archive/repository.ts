import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";
import { archiveMeta, schemaVersion, sessions } from "./schema.js";
import { generateShortCode } from "./short-code.js";

export type ArchiveDb = BetterSQLite3Database<typeof schema>;

function resolveMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "../../drizzle/archive"),
    path.join(here, "./drizzle/archive"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("Could not locate archive drizzle migrations folder");
  }
  return found;
}

export interface AppliedMigration {
  version: number;
  appliedAt: Date;
}

export interface ArchiveRepository {
  readonly db: ArchiveDb;
  getArchiveUuid(): string;
  getAppliedMigrations(): AppliedMigration[];
  generateShortCode(): string;
  close(): void;
}

interface DrizzleMigrationRow {
  id: number;
  created_at: number;
}

interface RepositoryOptions {
  dataDir: string;
}

export function createArchiveRepository({
  dataDir,
}: RepositoryOptions): ArchiveRepository {
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "archive.db"));
  const db: ArchiveDb = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });

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

  return {
    db,
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
    generateShortCode() {
      return generateShortCode({
        isTaken: (candidate) =>
          db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eq(sessions.shortCode, candidate))
            .get() !== undefined,
      });
    },
    close() {
      sqlite.close();
    },
  };
}
