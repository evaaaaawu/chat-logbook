PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_sessions_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`custom_title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sessions_meta`("id", "is_deleted", "created_at", "updated_at")
SELECT `session_id`, `is_deleted`, `created_at`, `updated_at` FROM `sessions_meta`;
--> statement-breakpoint
DROP TABLE `sessions_meta`;
--> statement-breakpoint
ALTER TABLE `__new_sessions_meta` RENAME TO `sessions_meta`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
