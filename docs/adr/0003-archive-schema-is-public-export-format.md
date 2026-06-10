# Treat the archive.db schema as a public export format

The Archive is the canonical export format, so its schema is treated as public: forward-only migrations, additive when possible, and no app-internal columns (those belong in the Metadata store). This trades schema flexibility for portability — a user can open `archive.db` in any tool that reads SQLite, and it stays readable across versions.

Vendor-specific quirks live inside the Raw payload, not in new columns. This is also why there is no separate "export to X" feature in scope: the Archive already is the export.
