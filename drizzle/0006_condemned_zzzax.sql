CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_date_idx` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_import_batch_idx` ON `transactions` (`import_batch_id`);--> statement-breakpoint
-- Without fresh stats SQLite cannot tell how selective these indexes are,
-- and the planner keeps choosing a full scan. Cheap at this table size.
ANALYZE;
