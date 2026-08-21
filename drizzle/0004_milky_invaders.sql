CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'project' NOT NULL,
	`color` text,
	`start_date` integer,
	`end_date` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (`name`);