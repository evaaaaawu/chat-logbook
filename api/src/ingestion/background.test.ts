import { describe, expect, it, vi } from "vitest";
import { startIngestionInBackground } from "./background.js";
import type { IngestOptions, IngestResult } from "./ingest.js";

describe("startIngestionInBackground", () => {
  it("returns synchronously before ingestion finishes and resolves done with the result", async () => {
    let resolveIngest: (r: IngestResult) => void = () => {};
    const ingestPromise = new Promise<IngestResult>((res) => {
      resolveIngest = res;
    });
    const runner = vi.fn(() => ingestPromise);

    const start = performance.now();
    const handle = startIngestionInBackground({} as IngestOptions, { runner });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
    expect(runner).toHaveBeenCalledTimes(1);

    resolveIngest({
      scanned: 1,
      rawInserted: 2,
      canonicalUpserted: 3,
      skippedByMtime: 0,
    });

    await expect(handle.done).resolves.toMatchObject({ rawInserted: 2 });
  });

  it("swallows runner rejections via onError instead of unhandled rejection", async () => {
    const err = new Error("boom");
    const runner = vi.fn(() => Promise.reject(err));
    const onError = vi.fn();

    const handle = startIngestionInBackground({} as IngestOptions, {
      runner,
      onError,
    });

    await handle.done;
    expect(onError).toHaveBeenCalledWith(err);
  });
});
