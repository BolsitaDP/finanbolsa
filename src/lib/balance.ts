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
      .filter(
        (tx) =>
          // Only movements the account's own reference point does not already
          // account for. `currentBalances` ignores anything dated on or before
          // referenceDate because it is baked into referenceBalanceMinor, so
          // unwinding those here too would add back money that was never in
          // the running balance — inventing history rather than reconstructing
          // it. An imported account whose reference date sits at the end of the
          // imported range has no knowable history before it, and must draw a
          // flat line, not a fabricated one.
          tx.date > account.referenceDate &&
          (tx.accountId === account.id ||
            (tx.type === "transfer" && tx.destinationAccountId === account.id))
      )
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

/**
 * The same series, from movements SQL has already summed by month.
 *
 * `netWorthTrend` above undoes one transaction at a time, but the walk is a
 * running total: the balance at a month end only ever needs the SUM of the
 * movements after it, never the individual rows. Feeding it per-month sums
 * makes it O(accounts x months) instead of O(transactions), and produces an
 * identical series — `__tests__/aggregates.test.ts` checks that against real
 * data, so this is a performance swap rather than a second implementation.
 *
 * `monthly` only needs to cover the months from the oldest boundary onwards;
 * earlier ones cannot affect the walk.
 */
export function netWorthTrendFromMonthly(
  accountsList: Account[],
  current: Map<string, number>,
  monthly: { accountId: string; month: string; movement: number }[],
  months: number
): NetWorthPoint[] {
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

  // Per account, its monthly sums. A movement dated in month M is already
  // inside the end-of-M balance, so it only gets undone for boundaries
  // strictly older than M.
  const byAccount = new Map<string, Map<string, number>>();
  for (const row of monthly) {
    const perMonth = byAccount.get(row.accountId) ?? new Map<string, number>();
    perMonth.set(row.month, (perMonth.get(row.month) ?? 0) + row.movement);
    byAccount.set(row.accountId, perMonth);
  }

  for (const account of accountsList) {
    const sums = byAccount.get(account.id);
    // monthEnds runs newest to oldest, so the set of months newer than each
    // boundary only ever grows: one forward pointer, no per-boundary rescan.
    let undone = 0;
    let from = 0;
    for (let i = 0; i < monthEnds.length; i++) {
      while (from < monthEnds.length && points[from].month > points[i].month) {
        undone += sums?.get(points[from].month) ?? 0;
        from++;
      }
      points[i].totalsByCurrency[account.currency] =
        (points[i].totalsByCurrency[account.currency] ?? 0) +
        (current.get(account.id) ?? 0) -
        undone;
    }
  }

  return points.reverse();
}
