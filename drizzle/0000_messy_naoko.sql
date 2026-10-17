CREATE TABLE `native_sync_attempts` (
	`task_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`base` text,
	`desired` text NOT NULL,
	`version` integer NOT NULL,
	`sync_revision` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_conflicts` (
	`task_id` text PRIMARY KEY NOT NULL,
	`base` text,
	`local` text NOT NULL,
	`remote` text,
	`fields` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_outbox` (
	`task_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_native_outbox_due` ON `native_outbox` (`next_attempt`);--> statement-breakpoint
CREATE TABLE `native_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`exported` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`task_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_recovery` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`data` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`baseline` text,
	`sync_revision` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
