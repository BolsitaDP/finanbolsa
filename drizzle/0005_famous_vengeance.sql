CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`file_name` text NOT NULL,
	`transaction_count` integer NOT NULL,
	`skipped_duplicates` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch_id` integer REFERENCES import_batches(id);