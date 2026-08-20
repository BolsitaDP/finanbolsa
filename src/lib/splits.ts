import type { transactionSplits, transactions } from "@/db/schema";

export type TransactionSplit = typeof transactionSplits.$inferSelect;
type Transaction = typeof transactions.$inferSelect;

export function groupSplitsByTransaction(splits: TransactionSplit[]): Map<number, TransactionSplit[]> {
  const byTx = new Map<number, TransactionSplit[]>();
  for (const s of splits) {
    const list = byTx.get(s.transactionId) ?? [];
    list.push(s);
    byTx.set(s.transactionId, list);
  }
  return byTx;
}

export type CategoryAllocation = { categoryId: string | null; amountMinor: number };

/**
 * A transaction's spend, attributed to categories. Without splits, that's
 * just the transaction's own category and full amount — same as always. With
 * splits, each split's amount counts under its own category, and whatever's
 * left over (the transaction's amount minus what's been split out) still
 * counts under the transaction's own category, so partially-broken-down cash
 * withdrawals don't lose track of the unallocated remainder.
 */
export function categoryAllocations(
  tx: Pick<Transaction, "id" | "categoryId" | "amountMinor">,
  splitsByTx: Map<number, TransactionSplit[]>
): CategoryAllocation[] {
  const splits = splitsByTx.get(tx.id);
  if (!splits || splits.length === 0) {
    return [{ categoryId: tx.categoryId, amountMinor: tx.amountMinor }];
  }
  const splitTotal = splits.reduce((s, sp) => s + sp.amountMinor, 0);
  const remainder = tx.amountMinor - splitTotal;
  const allocations: CategoryAllocation[] = splits.map((sp) => ({
    categoryId: sp.categoryId,
    amountMinor: sp.amountMinor,
  }));
  if (remainder > 0) allocations.push({ categoryId: tx.categoryId, amountMinor: remainder });
  return allocations;
}
