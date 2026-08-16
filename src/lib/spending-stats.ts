import type { transactions } from "@/db/schema";
import { monthKey, monthStart } from "@/lib/month";

type Transaction = typeof transactions.$inferSelect;

/** Total amount per currency, for a single type (expense/income), in one calendar month. */
export function totalForMonth(
  txs: Transaction[],
  month: string,
  type: "expense" | "income"
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== type || monthKey(tx.date) !== month) continue;
    totals.set(tx.currency, (totals.get(tx.currency) ?? 0) + tx.amountMinor);
  }
  return totals;
}

export type CategoryMonthTotal = { categoryId: string; currency: string; amountMinor: number };

/** Expense total per (category, currency), for one calendar month, sorted highest first. */
export function spendByCategoryForMonth(txs: Transaction[], month: string): CategoryMonthTotal[] {
  const totals = new Map<string, CategoryMonthTotal>();
  for (const tx of txs) {
    if (tx.type !== "expense" || !tx.categoryId || monthKey(tx.date) !== month) continue;
    const key = `${tx.categoryId}|${tx.currency}`;
    const entry = totals.get(key) ?? { categoryId: tx.categoryId, currency: tx.currency, amountMinor: 0 };
    entry.amountMinor += tx.amountMinor;
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}

export type MonthlyAmount = { month: string; amountMinor: number };

/**
 * Amount per month for the last `months` months (oldest first), zero-filled
 * for months with no matching transactions — unlike a simple group-by, this
 * makes gaps in activity visible on a trend chart instead of just omitting
 * that month's bar.
 */
export function monthlyAmounts(
  txs: Transaction[],
  months: number,
  type: "expense" | "income" = "expense"
): MonthlyAmount[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    buckets.set(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), 0);
  }
  for (const tx of txs) {
    if (tx.type !== type) continue;
    const key = monthKey(tx.date);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + tx.amountMinor);
  }
  return [...buckets.entries()].map(([month, amountMinor]) => ({ month, amountMinor }));
}

export { monthKey, monthStart };
