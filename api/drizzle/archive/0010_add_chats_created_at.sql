-- Denormalized "conversation start" column for the createdAt list sort (issue
-- #143, reconciling ADR-0017). The createdAt axis must page by what the reader
-- displays — min(messages.ts) — not first_seen_at (the ingest time), so the
-- paged order and the shown createdAt agree. Nullable on ADD COLUMN, then
-- backfilled below so every existing row gets a value; new rows are initialized
-- by the ingest write seam.
ALTER TABLE `chats` ADD COLUMN `created_at` integer;
--> statement-breakpoint
-- Backfill: earliest message ts per chat, falling back to first_seen_at for a
-- chat that has no messages yet, so created_at is never NULL and matches the
-- reader's displayed createdAt (min(messages.ts) ?? first_seen_at).
UPDATE `chats`
SET `created_at` = coalesce(
  (SELECT min(`m`.`ts`)
     FROM `messages` `m`
    WHERE `m`.`agent` = `chats`.`agent`
      AND `m`.`source_id` = `chats`.`source_id`),
  `chats`.`first_seen_at`
);
--> statement-breakpoint
-- Repoint the createdAt keyset index from first_seen_at to created_at: the
-- covering (sortKey, id) so the createdAt ORDER BY + LIMIT stays an index range
-- scan that stops after one page, in either direction.
DROP INDEX `chats_created_keyset_idx`;
--> statement-breakpoint
CREATE INDEX `chats_created_keyset_idx` ON `chats` (`created_at`,`id`);
