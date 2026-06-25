-- Denormalized "most recent activity" column for the server-side activity sort
-- (ADR-0017, issue #129). Nullable on ADD COLUMN, then backfilled below so every
-- existing row gets a value; new rows are initialized by the ingest write seam.
ALTER TABLE `chats` ADD COLUMN `updated_at` integer;
--> statement-breakpoint
-- Backfill: most recent message ts per chat, falling back to first_seen_at for a
-- chat that has no messages yet, so updated_at is never NULL.
UPDATE `chats`
SET `updated_at` = coalesce(
  (SELECT max(`m`.`ts`)
     FROM `messages` `m`
    WHERE `m`.`agent` = `chats`.`agent`
      AND `m`.`source_id` = `chats`.`source_id`),
  `chats`.`first_seen_at`
);
--> statement-breakpoint
-- Covering keyset indexes: (sortKey, id) so each list sort's ORDER BY + LIMIT is
-- an index range scan that stops after one page.
CREATE INDEX `chats_created_keyset_idx` ON `chats` (`first_seen_at`,`id`);
--> statement-breakpoint
CREATE INDEX `chats_updated_keyset_idx` ON `chats` (`updated_at`,`id`);
