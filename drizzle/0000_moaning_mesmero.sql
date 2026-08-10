CREATE TABLE `monitor_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`schedule` text DEFAULT 'Every 6 hours' NOT NULL,
	`alerts_enabled` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitored_urls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`group_name` text DEFAULT 'Website' NOT NULL,
	`status` text DEFAULT 'Unknown' NOT NULL,
	`http_code` integer,
	`final_url` text,
	`indexed_status` text DEFAULT 'Unknown' NOT NULL,
	`google_first_seen` text,
	`last_checked_at` text,
	`alert_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitored_urls_url_unique` ON `monitored_urls` (`url`);--> statement-breakpoint
CREATE INDEX `idx_monitored_urls_status` ON `monitored_urls` (`status`);--> statement-breakpoint
CREATE INDEX `idx_monitored_urls_group` ON `monitored_urls` (`group_name`);--> statement-breakpoint
CREATE TABLE `status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`http_code` integer,
	`final_url` text,
	`note` text,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`url_id`) REFERENCES `monitored_urls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_status_history_url_checked` ON `status_history` (`url_id`,`checked_at`);