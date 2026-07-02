import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDataDir } from "./reset.js";

describe("resetDataDir", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "reset-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const touch = (name: string): void => {
    fs.writeFileSync(path.join(dir, name), "");
  };
  const exists = (name: string): boolean => fs.existsSync(path.join(dir, name));

  it("removes every store file and its WAL sidecars", () => {
    for (const name of [
      "archive.db",
      "archive.db-wal",
      "archive.db-shm",
      "metadata.db",
      "checkpoint.db",
      "index.db",
      "data.db",
    ]) {
      touch(name);
    }

    const { removed } = resetDataDir(dir);

    expect(removed).toContain("archive.db");
    expect(removed).toContain("archive.db-wal");
    expect(removed).toContain("archive.db-shm");
    expect(removed).toContain("data.db");
    for (const name of removed) expect(exists(name)).toBe(false);
  });

  it("leaves non-store files untouched", () => {
    touch("archive.db");
    touch("notes.txt");

    const { removed } = resetDataDir(dir);

    expect(removed).toEqual(["archive.db"]);
    expect(exists("notes.txt")).toBe(true);
  });

  it("is a no-op on an empty directory", () => {
    expect(resetDataDir(dir).removed).toEqual([]);
  });
});
