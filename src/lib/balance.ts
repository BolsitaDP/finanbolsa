import type { accounts, transactions } from "@/db/schema";

type Account = typeof accounts.$inferSelect;
type Transaction = typeof transactions.$inferSelect;

/**
 * Signed effect of a transaction on one specific account's balance.
 *
 * Reference balances (and this formula) treat a credit card the same as a
 * bank account: the balance is "money you have", so a credit card's balance
 * is negative (debt) rather than a separately-tracked "amount owed". That
 * keeps this uniform across account types — an expense always subtracts,
 * income always adds, no special-casing by account type needed.
 */
function movementFor(tx: Transaction, accountId: string): number {
  if (tx.accountId === accountId) {
    return tx.type === "income" ? tx.amountMinor : -tx.amountMinor; // expense or transfer-out
  }
  if (tx.type === "transfer" && tx.destinationAccountId === accountId) {
    return tx.destinationAmountMinor ?? tx.amountMinor;
  }
  return 0;
}

/**
 * Current balance per account: its reference balance plus every movement
 * dated after the account's own reference point.
 */
export function currentBalances(
  accountsList: Account[],
  allTransactions: Transaction[]
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const account of accountsList) {
    let balance = account.referenceBalanceMinor;
    for (const tx of allTransactions) {
      if (tx.date > account.referenceDate) balance += movementFor(tx, account.id);
    }
    balances.set(account.id, balance);
  }
  return balances;
}

export type NetWorthPoint = { month: string; totalsByCurrency: Record<string, number> };

/**
 * Net worth per currency at each month-end for the last `months` months,
 * oldest first. There's no stored balance history to read, so this instead
 * starts from each account's known current balance and walks its ledger
 * backward — undoing one transaction's movement each time a month boundary
 * is crossed — which reconstructs the same series without needing any
 * historical snapshots.
 */
export function netWorthTrend(
  accountsList: Account[],
  allTransactions: Transaction[],
  months: number
): NetWorthPoint[] {
  const current = currentBalances(accountsList, allTransactions);

  const now = new Date();
  // monthEnds[0] = end of the current month ... monthEnds[months - 1] = oldest.
  const monthEnds: Date[] = [];
  for (let i = 0; i < months; i++) {
    monthEnds.push(new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999));
  }

  const points: NetWorthPoint[] = monthEnds.map((d) => ({
    month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    totalsByCurrency: {},
  }));

  for (const account of accountsList) {
    let runningBalance = current.get(account.id)!;
    const relevant = allTransactions
      .filter((tx) => tx.accountId === account.id || (tx.type === "transfer" && tx.destinationAccountId === account.id))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    let idx = 0;
    for (let i = 0; i < monthEnds.length; i++) {
      const boundary = monthEnds[i];
      while (idx < relevant.length && relevant[idx].date > boundary) {
        runningBalance -= movementFor(relevant[idx], account.id);
        idx++;
      }
      points[i].totalsByCurrency[account.currency] =
        (points[i].totalsByCurrency[account.currency] ?? 0) + runningBalance;
    }
  }

  return points.reverse();
}
