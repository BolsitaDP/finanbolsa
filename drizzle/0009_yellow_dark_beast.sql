CREATE TABLE `dismissed_recurring` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
