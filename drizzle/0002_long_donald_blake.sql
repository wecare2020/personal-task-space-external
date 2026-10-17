CREATE TABLE `native_share_assets` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`r2_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_share_assets_task` ON `native_share_assets` (`task_id`);--> statement-breakpoint
CREATE TABLE `native_share_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_task_shares` (
	`task_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`token_hash` text NOT NULL,
	`owner_id` text NOT NULL,
	`permission` text NOT NULL,
	`generation` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_share_token_hash` ON `native_task_shares` (`token_hash`);