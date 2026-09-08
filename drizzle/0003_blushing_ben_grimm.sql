CREATE TABLE `url_import_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`url` text NOT NULL,
	`result` text NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `url_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_url_import_items_import_url` ON `url_import_items` (`import_id`,`url`);--> statement-breakpoint
CREATE TABLE `url_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text NOT NULL,
	`imported_at` text NOT NULL,
	`total_rows` integer NOT NULL,
	`unique_urls` integer NOT NULL,
	`added_count` integer NOT NULL,
	`existing_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`invalid_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_url_imports_imported_at` ON `url_imports` (`imported_at`);