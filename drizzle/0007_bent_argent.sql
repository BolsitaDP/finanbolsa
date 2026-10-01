CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`from_currency` text NOT NULL,
	`to_currency` text NOT NULL,
	`rate` real NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_month_pair_idx` ON `exchange_rates` (`month`,`from_currency`,`to_currency`);--> statement-breakpoint
CREATE INDEX `exchange_rates_month_idx` ON `exchange_rates` (`month`);