/**
 * Aggregation done in SQL instead of in JavaScript.
 *
 * The dashboard, the budget and the recurring page used to answer every question
 * by loading all 19 columns of all 50,000 transactions into memory and reducing
 * them in JS. A GROUP BY returns a dozen rows where the full scan returned
 * fifty thousand, and SQLite does the summing in C.
 *
 * The functions in `balance.ts` and `spending-stats.ts` are deliberately NOT
 * deleted. They stay as the readable reference implementation, and
 * `__tests__/aggregates.test.ts` asserts that each function here returns exactly
 * what its JS counterpart returns, against the real database. An aggregate that
 * silently disagrees with the code it replaced is worse than a slow page.
 *
 * Months are bucketed in LOCAL time through `transactionMonth`, because that is
 * what `monthKey()` does. See the note in `month-sql.ts`.
 *
 * The union query below spells column names out literally. A UNION ALL of two
 * drizzle query builders is not expressible, and the alternative — building the
 * whole statement from interpolated identifiers — is unreadable. The parity test
 * is what makes this safe: a renamed column fails there immediately.
 */

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { accounts, transactionSplits, transactions } from "@/db/schema";
import { transactionMonth } from "@/lib/month-sql";
import { categoryAllocations, groupSplitsByTransaction } from "@/lib/splits";
import type { RecurringCandidate } from "@/lib/recurring";

/** `"2026-08|expense|USD"` -> total in minor units. */
export type TotalsByMonth = Map<string, number>;

export const totalKey = (month: string, type: string, currency: string) =>
  `${month}|${type}|${currency}`;

/**
 * Summed amount per (month, type, currency) for the given months.
 *
 * Replaces four separate `totalForMonth` passes, each of which re-walked the
 * whole transaction list.
 */
export async function totalsByMonth(months: string[]): Promise<TotalsByMonth> {
  if (months.length === 0) return new Map();
  const list = sql.join(months.map((month) => sql`${month}`), sql`, `);
  const rows = await db.all<{ month: string; type: string; currency: string; total: number }>(sql`
    select ${transactionMonth} as month,
           ${transactions.type} as type,
           ${transactions.currency} as currency,
           sum(${transactions.amountMinor}) as total
    from ${transactions}
    where ${transactions.deletedAt} is null
      and ${transactionMonth} in (${list})
    group by month, type, currency
  `);
  const out: TotalsByMonth = new Map();
  for (const row of rows) {
    out.set(totalKey(row.month, row.type, row.currency), Number(row.total));
  }
  return out;
}

/** The convenience wrapper the dashboard actually wants. */
export function pickTotal(
  totals: TotalsByMonth,
  month: string,
  type: string,
  currency: string
): number {
  return totals.get(totalKey(month, type, currency)) ?? 0;
}

/** Totals for one month and type, in the `Map<currency, total>` shape the cards expect. */
export function totalsFor(
  totals: TotalsByMonth,
  month: string,
  type: string
): Map<string, number> {
  const prefix = `${month}|${type}|`;
  const out = new Map<string, number>();
  for (const [key, value] of totals) {
    if (key.startsWith(prefix)) out.set(key.slice(prefix.length), value);
  }
  return out;
}

/**
 * Net movement per account, counting only transactions dated after that
 * account's own reference date.
 *
 * A transaction touches one account — its own — and, when it is a transfer, a
 * second one. The JS walked every transaction once per account; this is the
 * same arithmetic as a UNION ALL of the two sides grouped by account. Callers
 * add each account's `referenceBalanceMinor` to get the current balance.
 *
 * `destination_account_id <> account_id` keeps this identical to the JS, whose
 * `movementFor` returns from the source branch before ever considering the
 * transfer branch.
 */
export async function movementByAccount(): Promise<Map<string, number>> {
  const rows = await db.all<{ account_id: string; movement: number }>(sql`
    select account_id, sum(movement) as movement
    from (
      select t.account_id as account_id,
             case when t.type = 'income' then t.amount_minor else -t.amount_minor end as movement
      from transactions t
      join accounts a on a.id = t.account_id
      where t.deleted_at is null and t.date > a.reference_date
      union all
      select t.destination_account_id as account_id,
             coalesce(t.destination_amount_minor, t.amount_minor) as movement
      from transactions t
      join accounts a on a.id = t.destination_account_id
      where t.deleted_at is null
        and t.type = 'transfer'
        and t.destination_account_id is not null
        and t.destination_account_id <> t.account_id
        and t.date > a.reference_date
    )
    group by account_id
  `);
  const out = new Map<string, number>();
  for (const row of rows) out.set(row.account_id, Number(row.movement));
  return out;
}

/** Current balance per account, aggregate side. The aggregate counterpart of `currentBalances`. */
export async function currentBalances(): Promise<Map<string, number>> {
  const accountRows = await db
    .select({ id: accounts.id, referenceBalanceMinor: accounts.referenceBalanceMinor })
    .from(accounts);
  const movements = await movementByAccount();
  return new Map(
    accountRows.map((account) => [
      account.id,
      account.referenceBalanceMinor + (movements.get(account.id) ?? 0),
    ])
  );
}

export type AccountMonthMovement = { accountId: string; month: string; movement: number };

/**
 * The same movement, bucketed by month instead of listed per transaction.
 *
 * This is what makes the net-worth trend cheap. The trend reconstructs each
 * month-end balance by walking backwards from today, undoing one movement at a
 * time — but that walk is a running total, so it only ever needs the *sum* of
 * each month's movements, never the individual rows. Summing in SQL turns 50,000
 * rows into at most `accounts x months`.
 *
 * Bounded to [fromMonth, toMonth] inclusive; `netWorthTrendFromMonthly` ignores
 * the boundary months it does not need.
 */
export async function movementByAccountAndMonth(
  fromMonth: string,
  toMonth: string
): Promise<AccountMonthMovement[]> {
  const rows = await db.all<{ account_id: string; month: string; movement: number }>(sql`
    select account_id, month, sum(movement) as movement
    from (
      select t.account_id as account_id,
             -- Deliberately not the shared transactionMonth expression: this
             -- subquery aliases the table as t, so the unaliased column
             -- reference in that expression would not resolve. Same strftime,
             -- same local time, spelled out for the alias.
             strftime('%Y-%m', t.date, 'unixepoch', 'localtime') as month,
             case when t.type = 'income' then t.amount_minor else -t.amount_minor end as movement
      from transactions t
      join accounts a on a.id = t.account_id
      where t.deleted_at is null and t.date > a.reference_date
      union all
      select t.destination_account_id as account_id,
             strftime('%Y-%m', t.date, 'unixepoch', 'localtime') as month,
             coalesce(t.destination_amount_minor, t.amount_minor) as movement
      from transactions t
      join accounts a on a.id = t.destination_account_id
      where t.deleted_at is null
        and t.type = 'transfer'
        and t.destination_account_id is not null
        and t.destination_account_id <> t.account_id
        and t.date > a.reference_date
    )
    where month between ${fromMonth} and ${toMonth}
    group by account_id, month
  `);
  return rows.map((row) => ({
    accountId: row.account_id,
    month: row.month,
    movement: Number(row.movement),
  }));
}

export type CategoryMonthTotal = { categoryId: string; currency: string; amountMinor: number };

/**
 * Expense total per (category, currency) for one month, split-aware.
 *
 * Hybrid on purpose. SQL handles the thousands of ordinary expenses with a
 * GROUP BY; the handful of transactions that actually carry splits are loaded
 * whole and attributed in JS by `categoryAllocations`, because a split
 * reassigns part of one transaction to other categories and that arithmetic
 * has no clean SQL form. Splits are a deliberate, small feature, so "the
 * exceptions" is a set of size ~0 in the common case.
 *
 * The split transactions are EXCLUDED from the GROUP BY so their amounts are
 * not counted twice — once under their own category and once via their splits.
 */
export async function spendByCategoryInMonth(month: string): Promise<CategoryMonthTotal[]> {
  const splitRows = await db
    .selectDistinct({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits);
  const splitTxIds = splitRows.map((row) => row.transactionId);

  const totals = new Map<string, CategoryMonthTotal>();
  const add = (categoryId: string, currency: string, amountMinor: number) => {
    const key = `${categoryId}|${currency}`;
    const entry = totals.get(key) ?? { categoryId, currency, amountMinor: 0 };
    entry.amountMinor += amountMinor;
    totals.set(key, entry);
  };

  // --- the ordinary majority, summed by SQLite
  const exclusion =
    splitTxIds.length > 0
      ? sql` and id not in (${sql.join(
          splitTxIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``;
  const rows = await db.all<{ category_id: string; currency: string; total: number }>(sql`
    select ${transactions.categoryId} as category_id,
           ${transactions.currency} as currency,
           sum(${transactions.amountMinor}) as total
    from ${transactions}
    where ${transactions.deletedAt} is null
      and ${transactions.type} = 'expense'
      and ${transactions.categoryId} is not null
      and ${transactionMonth} = ${month}${exclusion}
    group by category_id, currency
  `);
  for (const row of rows) add(row.category_id, row.currency, Number(row.total));

  // --- the split ones, attributed in JS
  if (splitTxIds.length > 0) {
    const list = sql.join(splitTxIds.map((id) => sql`${id}`), sql`, `);
    const splitTx = await db.all<{
      id: number;
      categoryId: string | null;
      amountMinor: number;
      currency: string;
    }>(sql`
      select ${transactions.id} as id,
             ${transactions.categoryId} as categoryId,
             ${transactions.amountMinor} as amountMinor,
             ${transactions.currency} as currency
      from ${transactions}
      where ${transactions.deletedAt} is null
        and ${transactions.type} = 'expense'
        and ${transactionMonth} = ${month}
        and id in (${list})
    `);
    if (splitTx.length > 0) {
      const splits = await db.select().from(transactionSplits);
      const splitsByTx = groupSplitsByTransaction(splits);
      for (const tx of splitTx) {
        for (const alloc of categoryAllocations(tx, splitsByTx)) {
          if (!alloc.categoryId) continue;
          add(alloc.categoryId, tx.currency, alloc.amountMinor);
        }
      }
    }
  }

  return [...totals.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}

export type { RecurringCandidate } from "@/lib/recurring";

/**
 * The only columns recurring detection looks at, and only the rows it can use.
 *
 * `detectRecurring` groups by payee, falling back to the lowercased
 * description, and skips anything with neither — so a row that is not an
 * expense, or has neither field, is dead weight the database never has to send.
 * Six narrow columns instead of nineteen wide ones.
 */
export async function recurringCandidates(): Promise<RecurringCandidate[]> {
  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      date: transactions.date,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      categoryId: transactions.categoryId,
      payeeId: transactions.payeeId,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, "expense"),
        or(isNotNull(transactions.payeeId), isNotNull(transactions.description))
      )
    );
}
