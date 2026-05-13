CREATE TABLE `session_scan_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`session_id` text NOT NULL,
	`source_path` text NOT NULL,
	`last_mtime_ms` integer NOT NULL,
	`last_size_bytes` integer NOT NULL,
	`last_scanned_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_scan_state_idx` ON `session_scan_state` (`agent`,`session_id`);