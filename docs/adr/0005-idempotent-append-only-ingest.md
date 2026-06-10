# Idempotent, append-only ingest with last-write-wins normalization

Ingestion is keyed on `(agent, source_id, payload_hash)`, so re-runs are no-ops. A changed or truncated Source appends a **new** Raw row rather than overwriting — Raw is append-only, which preserves every prior version. The Normalized layer resolves conflicts by last-write-wins on `ts`.

## Consequences

- Raw can hold multiple rows for what was "the same" Source line; that duplication is deliberate, the cost of never losing a prior version.
- Idempotency is content-based (`payload_hash`), so it survives path collisions and re-scans without bookkeeping.
