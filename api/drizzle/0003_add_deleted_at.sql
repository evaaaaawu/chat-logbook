ALTER TABLE `chats_meta` ADD `deleted_at` integer;--> statement-breakpoint
UPDATE `chats_meta` SET `deleted_at` = `updated_at` WHERE `is_deleted` = 1;