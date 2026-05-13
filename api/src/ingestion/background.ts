import {
  runIngestion,
  type IngestOptions,
  type IngestResult,
} from "./ingest.js";

export interface BackgroundIngestionHandle {
  done: Promise<IngestResult | null>;
}

export interface BackgroundOptions {
  runner?: (opts: IngestOptions) => Promise<IngestResult>;
  onError?: (err: unknown) => void;
}

export function startIngestionInBackground(
  opts: IngestOptions,
  bg: BackgroundOptions = {}
): BackgroundIngestionHandle {
  const runner = bg.runner ?? runIngestion;
  const onError =
    bg.onError ??
    ((err: unknown) => {
      console.error("[ingestion] background run failed:", err);
    });

  const done = runner(opts)
    .then((r): IngestResult | null => r)
    .catch((err): IngestResult | null => {
      onError(err);
      return null;
    });

  return { done };
}
