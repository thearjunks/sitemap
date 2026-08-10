CREATE TABLE `general_monitored_urls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'Unknown' NOT NULL,
	`http_code` integer,
	`final_url` text,
	`last_checked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `general_monitored_urls_url_unique` ON `general_monitored_urls` (`url`);--> statement-breakpoint
CREATE INDEX `idx_general_urls_status` ON `general_monitored_urls` (`status`);--> statement-breakpoint
CREATE INDEX `idx_general_urls_domain` ON `general_monitored_urls` (`domain`);