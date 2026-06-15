CREATE TABLE `chat_scan_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`source_id` text NOT NULL,
	`source_path` text NOT NULL,
	`last_mtime_ms` integer NOT NULL,
	`last_size_bytes` integer NOT NULL,
	`last_scanned_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_scan_state_idx` ON `chat_scan_state` (`agent`,`source_id`);