ALTER TABLE `sessions` RENAME TO `chats`;--> statement-breakpoint
ALTER TABLE `chats` RENAME COLUMN `short_code` TO `chat_id`;--> statement-breakpoint
ALTER TABLE `chats` RENAME COLUMN `source_session_id` TO `source_id`;--> statement-breakpoint
ALTER TABLE `raw_messages` RENAME COLUMN `session_id` TO `source_id`;--> statement-breakpoint
DROP INDEX `raw_messages_idem_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `raw_messages_idem_idx` ON `raw_messages` (`agent`,`source_id`,`payload_hash`);--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN `session_id` TO `source_id`;--> statement-breakpoint
DROP INDEX `messages_canonical_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_canonical_idx` ON `messages` (`agent`,`source_id`,`message_id`);--> statement-breakpoint
ALTER TABLE `session_scan_state` RENAME COLUMN `session_id` TO `source_id`;--> statement-breakpoint
DROP INDEX `session_scan_state_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `session_scan_state_idx` ON `session_scan_state` (`agent`,`source_id`);--> statement-breakpoint
ALTER TABLE `ingestion_events` RENAME COLUMN `session_id` TO `source_id`;--> statement-breakpoint
DROP INDEX `sessions_agent_source_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `chats_agent_source_idx` ON `chats` (`agent`,`source_id`);--> statement-breakpoint
DROP INDEX `sessions_short_code_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `chats_chat_id_unique` ON `chats` (`chat_id`);
