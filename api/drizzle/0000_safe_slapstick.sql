CREATE TABLE `sessions_meta` (
	`session_id` text PRIMARY KEY NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
