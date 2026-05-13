CREATE TABLE `ingestion_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`session_id` text NOT NULL,
	`source_path` text NOT NULL,
	`event_type` text NOT NULL,
	`detail` text NOT NULL,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`role` text NOT NULL,
	`ts` integer NOT NULL,
	`text` text NOT NULL,
	`blocks` text NOT NULL,
	`raw_id` integer NOT NULL,
	FOREIGN KEY (`raw_id`) REFERENCES `raw_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_canonical_idx` ON `messages` (`agent`,`session_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `raw_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`session_id` text NOT NULL,
	`source_path` text NOT NULL,
	`source_locator` text NOT NULL,
	`raw_payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_messages_idem_idx` ON `raw_messages` (`agent`,`session_id`,`payload_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`short_code` text NOT NULL,
	`agent` text NOT NULL,
	`source_session_id` text NOT NULL,
	`first_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_short_code_unique` ON `sessions` (`short_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_agent_source_idx` ON `sessions` (`agent`,`source_session_id`);