CREATE TABLE `chat_sort_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`text_key` text,
	`sort_key` text
);
--> statement-breakpoint
CREATE INDEX `chat_sort_keys_sort_key_idx` ON `chat_sort_keys` (`sort_key`,`id`);
