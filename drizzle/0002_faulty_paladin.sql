ALTER TABLE `monitored_urls` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `monitored_urls` ADD `removed_by` text;--> statement-breakpoint
ALTER TABLE `monitored_urls` ADD `removal_reason` text;--> statement-breakpoint
ALTER TABLE `monitored_urls` ADD `status_before_removal` text;