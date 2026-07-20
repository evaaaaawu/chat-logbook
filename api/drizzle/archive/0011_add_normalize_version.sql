-- The normalize-output version this archive's Normalized layer was last rebuilt
-- at. Startup compares it to the code's NORMALIZE_VERSION and re-normalizes from
-- Raw once per bump, so a new block kind (e.g. `command`, ADR-0023) reaches
-- already-archived dormant chats without re-reading Source. Additive, NOT NULL
-- with a 0 default so every existing archive reads as "behind" and gets the
-- first re-normalize pass.
ALTER TABLE `archive_meta` ADD COLUMN `normalize_version` integer DEFAULT 0 NOT NULL;
