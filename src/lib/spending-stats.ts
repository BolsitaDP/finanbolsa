import type { transactions } from "@/db/schema";
import { monthKey, monthStart } from "@/lib/month";
import { categoryAllocations, type TransactionSplit } from "@/lib/splits";

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

/**
 * Expense total per (category, currency), for one calendar month, sorted
 * highest first. A transaction with splits (e.g. a cash withdrawal broken
 * down into specific purchases) attributes each split to its own category
 * instead of lumping the whole amount under the transaction's category —
 * see `categoryAllocations`. `splitsByTx` is optional so callers that never
 * deal with splits don't need to pass anything.
 */
export function spendByCategoryForMonth(
  txs: Transaction[],
  month: string,
  splitsByTx?: Map<number, TransactionSplit[]>
): CategoryMonthTotal[] {
  const totals = new Map<string, CategoryMonthTotal>();
  for (const tx of txs) {
    if (tx.type !== "expense" || monthKey(tx.date) !== month) continue;
    for (const alloc of categoryAllocations(tx, splitsByTx ?? new Map())) {
      if (!alloc.categoryId) continue;
      const key = `${alloc.categoryId}|${tx.currency}`;
      const entry = totals.get(key) ?? { categoryId: alloc.categoryId, currency: tx.currency, amountMinor: 0 };
      entry.amountMinor += alloc.amountMinor;
      totals.set(key, entry);
    }
  }
  return [...totals.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}

export type MonthlyAmount = { month: string; amountMinor: number };

/**
 * Amount per month for the last `months` months (oldest first), zero-filled
 * for months with no matching transactions — unlike a simple group-by, this
 * makes gaps in activity visible on a trend chart instead of just omitting
 * that month's bar. Takes a generic {date, amountMinor} shape rather than a
 * full Transaction — its one caller feeds it split-aware category
 * allocations, which aren't real transaction rows — so any type/currency
 * filtering happens on the caller's side before calling this.
 */
export function monthlyAmounts(
  entries: { date: Date; amountMinor: number }[],
  months: number
): MonthlyAmount[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    buckets.set(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), 0);
  }
  for (const entry of entries) {
    const key = monthKey(entry.date);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + entry.amountMinor);
  }
  return [...buckets.entries()].map(([month, amountMinor]) => ({ month, amountMinor }));
}

export { monthKey, monthStart };
