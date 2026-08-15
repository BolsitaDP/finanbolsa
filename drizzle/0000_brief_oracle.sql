CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`credit_limit_minor` real,
	`status` text DEFAULT 'active' NOT NULL,
	`opened_at` integer,
	`notes` text,
	`reference_date` integer NOT NULL,
	`reference_balance_minor` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_category_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`schema_version` text DEFAULT '2.0' NOT NULL,
	`base_currency` text DEFAULT 'COP' NOT NULL,
	`start_date` integer NOT NULL,
	`owner` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` integer NOT NULL,
	`type` text NOT NULL,
	`account_id` text NOT NULL,
	`destination_account_id` text,
	`amount_minor` real NOT NULL,
	`currency` text NOT NULL,
	`destination_amount_minor` real,
	`destination_currency` text,
	`category_id` text,
	`description` text,
	`project_trip` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
