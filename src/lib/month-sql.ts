import { sql } from "drizzle-orm";

import { transactions } from "@/db/schema";

/**
 * `'YYYY-MM'` in LOCAL time — the same bucketing as `monthKey()`.
 *
 * Must be written in local time, not UTC, or a transaction late on the last day
 * of a month lands in the next one for SQL queries while the JS side disagrees.
 * Used for "which months have foreign-currency movements", which is what the
 * TRM refresh acts on.
 */
export const transactionMonth = sql<string>`strftime('%Y-%m', ${transactions.date}, 'unixepoch', 'localtime')`;
