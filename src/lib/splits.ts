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

export type SpendAllocation = {
  date: Date;
  currency: string;
  amountMinor: number;
  categoryId: string | null;
  payeeId: string | null;
};

/**
 * Unified spend attribution for one category or payee's detail page: each
 * transaction directly tagged with it contributes whatever hasn't been split
 * away to something else (its full amount when it has no splits), plus
 * whatever other transactions' splits specifically allocated to it. Shared by
 * the category and payee detail pages — the caller does the DB filtering
 * (by categoryId or payeeId respectively) and this just combines the two
 * sources; both category and payee ids ride along on every entry so either
 * page can derive its own "top X" breakdown from the same list.
 */
export function buildAllocations(
  directTx: Pick<Transaction, "id" | "date" | "currency" | "amountMinor" | "categoryId" | "payeeId">[],
  splitsByTx: Map<number, TransactionSplit[]>,
  splitsIntoTarget: TransactionSplit[],
  splitParentById: Map<number, Pick<Transaction, "date" | "currency">>
): SpendAllocation[] {
  const allocations: SpendAllocation[] = [];
  for (const t of directTx) {
    const splits = splitsByTx.get(t.id) ?? [];
    const remainder = t.amountMinor - splits.reduce((s, sp) => s + sp.amountMinor, 0);
    if (remainder > 0) {
      allocations.push({
        date: t.date,
        currency: t.currency,
        amountMinor: remainder,
        categoryId: t.categoryId,
        payeeId: t.payeeId,
      });
    }
  }
  for (const s of splitsIntoTarget) {
    const parent = splitParentById.get(s.transactionId);
    if (!parent) continue;
    allocations.push({
      date: parent.date,
      currency: parent.currency,
      amountMinor: s.amountMinor,
      categoryId: s.categoryId,
      payeeId: s.payeeId,
    });
  }
  return allocations;
}
