CREATE TABLE `native_task_read_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_task_read_key_hash` ON `native_task_read_keys` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_task_read_key_owner` ON `native_task_read_keys` (`owner_id`);