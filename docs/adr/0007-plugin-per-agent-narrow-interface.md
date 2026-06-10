# One Plugin per Agent, behind a narrow three-method interface

Source formats are polymorphic — per-session JSONL, a single markdown file, an internal SQLite database. Each Agent gets one **Plugin** implementing a narrow interface — `discover`, `extractRaw`, `normalize` — with zero shared state, so the ingestion pipeline stays Agent-agnostic and adding an Agent is a contained change (implement the interface, register it).

A thicker or shared interface was rejected: it would leak per-Agent differences into the pipeline instead of absorbing them inside the Plugin. The narrowness is the point — it is what keeps the pipeline from growing Agent-specific branches.
