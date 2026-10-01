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
import { monthInRange, monthsInRange, transactionMonth } from "@/lib/month-sql";
import { monthRange } from "@/lib/month";
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
  const rows = await db.all<{ month: string; type: string; currency: string; total: number }>(sql`
    select ${transactionMonth} as month,
           ${transactions.type} as type,
           ${transactions.currency} as currency,
           sum(${transactions.amountMinor}) as total
    from ${transactions}
    where ${transactions.deletedAt} is null
      and ${monthsInRange(months)}
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
  // The date range goes INSIDE both branches of the union, not only on the outer
  // `where month between`. On the outside it filters a column the subqueries
  // computed, so no index can ever act on it and the whole table is read: 201 ms
  // at 50k rows. Inside, each branch becomes `date >= ? and date < ?` against
  // `transactions_date_idx` and only the last twelve months are touched.
  //
  // Bounded to [fromMonth, toMonth] inclusive, which is exactly what the outer
  // `month between` was asking for — `monthRange` ends on the first instant of the
  // month after `toMonth`, so a charge on the last day still counts and a charge
  // in the next month does not.
  const { start } = monthRange(fromMonth);
  const { end } = monthRange(toMonth);
  const from = Math.floor(start.getTime() / 1000);
  const to = Math.floor(end.getTime() / 1000);

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
      where t.deleted_at is null
        and t.date > a.reference_date
        and t.date >= ${from} and t.date < ${to}
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
        and t.date >= ${from} and t.date < ${to}
    )
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
 * Expense total per (category, month, currency) for the given months, split-aware.
 *
 * The multi-month form of `spendByCategoryInMonth`, which delegates here. The
 * outlier alert needs a category's whole recent history in one pass, and calling
 * the single-month version six times would mean six scans of the same rows.
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
export async function spendByCategoryByMonth(
  months: string[]
): Promise<(CategoryMonthTotal & { month: string })[]> {
  const totals = new Map<string, CategoryMonthTotal & { month: string }>();
  const add = (categoryId: string, currency: string, month: string, amountMinor: number) => {
    const key = `${categoryId}|${currency}|${month}`;
    const entry = totals.get(key) ?? { categoryId, currency, month, amountMinor: 0 };
    entry.amountMinor += amountMinor;
    totals.set(key, entry);
  };

  if (months.length === 0) return [];

  const splitRows = await db
    .selectDistinct({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits);
  const splitTxIds = splitRows.map((row) => row.transactionId);

  // --- the ordinary majority, summed by SQLite
  const exclusion =
    splitTxIds.length > 0
      ? sql` and id not in (${sql.join(
          splitTxIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``;
  const rows = await db.all<{
    category_id: string;
    currency: string;
    month: string;
    total: number;
  }>(sql`
    select ${transactions.categoryId} as category_id,
           ${transactions.currency} as currency,
           ${transactionMonth} as month,
           sum(${transactions.amountMinor}) as total
    from ${transactions}
    where ${transactions.deletedAt} is null
      and ${transactions.type} = 'expense'
      and ${transactions.categoryId} is not null
      and ${monthsInRange(months)}${exclusion}
    group by category_id, currency, month
  `);
  for (const row of rows) add(row.category_id, row.currency, row.month, Number(row.total));

  // --- the split ones, attributed in JS
  if (splitTxIds.length > 0) {
    const list = sql.join(splitTxIds.map((id) => sql`${id}`), sql`, `);
    const splitTx = await db.all<{
      id: number;
      categoryId: string | null;
      amountMinor: number;
      currency: string;
      month: string;
    }>(sql`
      select ${transactions.id} as id,
             ${transactions.categoryId} as categoryId,
             ${transactions.amountMinor} as amountMinor,
             ${transactions.currency} as currency,
             ${transactionMonth} as month
      from ${transactions}
      where ${transactions.deletedAt} is null
        and ${transactions.type} = 'expense'
        and ${monthsInRange(months)}
        and id in (${list})
    `);
    if (splitTx.length > 0) {
      const splits = await db.select().from(transactionSplits);
      const splitsByTx = groupSplitsByTransaction(splits);
      for (const tx of splitTx) {
        for (const alloc of categoryAllocations(tx, splitsByTx)) {
          if (!alloc.categoryId) continue;
          add(alloc.categoryId, tx.currency, tx.month, alloc.amountMinor);
        }
      }
    }
  }

  return [...totals.values()].sort((a, b) => b.amountMinor - a.amountMinor);
}

/** One month, which is what every page but the outlier alert asks for. */
export async function spendByCategoryInMonth(month: string): Promise<CategoryMonthTotal[]> {
  const rows = await spendByCategoryByMonth([month]);
  return rows.map(({ categoryId, currency, amountMinor }) => ({ categoryId, currency, amountMinor }));
}

export type { RecurringCandidate } from "@/lib/recurring";

export type PayeeMonthTotal = { payeeId: string; currency: string; amountMinor: number };

/**
 * Expense total per (payee, currency) for one month, largest first.
 *
 * Deliberately NOT split-aware, unlike `spendByCategoryInMonth`. A split
 * reattributes a lump charge to other *categories*; it doesn't change who was
 * paid. The supermarket withdrawal split into " mercado" and "carnes" was still
 * one payment to one merchant, and inflating that merchant's total to the sum of
 * the split parts would double-count it.
 *
 * Rows without a payee are excluded rather than collected into a "sin comercio"
 * bucket. That bucket would be every unrelated cash withdrawal and card charge
 * that never got a merchant name, ranked against real shops — a number with no
 * meaning that would sit at the top of the list.
 */
export async function spendByPayeeInMonth(month: string): Promise<PayeeMonthTotal[]> {
  const rows = await db.all<{ payee_id: string; currency: string; total: number }>(sql`
    select ${transactions.payeeId} as payee_id,
           ${transactions.currency} as currency,
           sum(${transactions.amountMinor}) as total
    from ${transactions}
    where ${transactions.deletedAt} is null
      and ${transactions.type} = 'expense'
      and ${transactions.payeeId} is not null
      and ${monthInRange(month)}
    group by payee_id, currency
    order by total desc
  `);
  return rows.map((row) => ({
    payeeId: row.payee_id,
    currency: row.currency,
    amountMinor: Number(row.total),
  }));
}

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
      accountId: transactions.accountId,
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

/**
 * Movements dated on or before their own account's reference point.
 *
 * Written as a query that returns **only the offenders**, not as a scan handed to
 * JavaScript. The first version of this check loaded every non-deleted movement
 * and compared dates in JS, which put a 50,000-row table back on the dashboard's
 * hot path: 118 ms → 760 ms, undoing the whole of `aggregates.ts` for a check that
 * on a healthy ledger finds nothing. The comparison is the same either way, but
 * transferring the answer instead of the question is the difference between a
 * scan and a query.
 *
 * Still one pass, and still index-friendly: `transactions_date_idx` bounds the
 * date, and the join to `accounts` is by primary key.
 */
export async function movementsBeforeReference() {
  const rows = await db.all<{
    id: number;
    account_id: string;
    account_name: string;
    account_reference_date: string;
    date: string;
    amount_minor: number;
    currency: string;
    description: string | null;
  }>(sql`
    select t.id as id,
           a.id as account_id,
           a.name as account_name,
           a.reference_date as account_reference_date,
           t.date as date,
           t.amount_minor as amount_minor,
           t.currency as currency,
           t.description as description
    from transactions t
    join accounts a on a.id = t.account_id
    where t.deleted_at is null
      and t.date <= a.reference_date
  `);
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    referenceDate: new Date(row.account_reference_date),
    date: new Date(row.date),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    description: row.description,
  }));
}

export type OversplitRow = {
  transactionId: number;
  currency: string;
  date: Date;
  description: string | null;
  parentAmount: number;
  splitTotal: number;
};

/**
 * Breakdowns that attribute more than their transaction holds.
 *
 * A `HAVING` on the same GROUP BY that totals the splits, for the same reason as
 * above: on a healthy ledger the result is empty, and the point of the check is
 * that emptiness. Every t.* column is in the GROUP BY rather than relied on as
 * bare, because that is only guaranteed by SQLite and not by the SQL standard —
 * and this app runs on exactly one database, so there is no reason to depend on
 * the guarantee instead of asking for it.
 */
export async function oversplitTransactions(): Promise<OversplitRow[]> {
  const rows = await db.all<{
    transaction_id: number;
    currency: string;
    date: string;
    description: string | null;
    parent_amount: number;
    split_total: number;
  }>(sql`
    select s.transaction_id as transaction_id,
           t.currency as currency,
           t.date as date,
           t.description as description,
           t.amount_minor as parent_amount,
           sum(s.amount_minor) as split_total
    from transaction_splits s
    join transactions t on t.id = s.transaction_id
    where t.deleted_at is null
    group by s.transaction_id, t.currency, t.date, t.description, t.amount_minor
    having sum(s.amount_minor) > abs(t.amount_minor)
  `);
  return rows.map((row) => ({
    transactionId: row.transaction_id,
    currency: row.currency,
    date: new Date(row.date),
    description: row.description,
    parentAmount: Number(row.parent_amount),
    splitTotal: Number(row.split_total),
  }));
}

export type RecentSplit = {
  categoryId: string | null;
  payeeId: string | null;
  /** veces usada, para ordenar por hábito y no por alfabetía */
  uses: number;
};

/**
 * Los desgloses que más se repiten, para sugerirlos.
 *
 * ROADMAP §2.3: un retiro de 300.000 se desglosa con las mismas cuatro
 * categorías casi siempre, y escribirlas a mano cada vez es el trabajo que la
 * feature quita. Se agrupa por (categoría, payee) —no solo por categoría— porque
 * un desglose de un retiro de mercado y uno de una cena usan categorías
 * distintas aunque alguna coincida.
 *
 * Se ordenan por **uso frecuente y reciente**, no por la fecha del último uso: una
 * combinación usada 20 veces hace un año es más probable que sea la correcta que
 * una usada dos veces esta semana, y el usuario casi siempre desglosa lo mismo.
 *
 * Solo sobre splits de padre no eliminado: un desglose de un movimiento borrado no
 * es una sugerencia, es un fantasma.
 */
export async function recentSplits(limit: number): Promise<RecentSplit[]> {
  const rows = await db.all<{
    category_id: string | null;
    payee_id: string | null;
    uses: number;
  }>(sql`
    select s.category_id as category_id,
           s.payee_id as payee_id,
           count(*) as uses
    from transaction_splits s
    join transactions t on t.id = s.transaction_id
    where t.deleted_at is null
    group by s.category_id, s.payee_id
    order by uses desc
    limit ${limit}
  `);
  return rows.map((row) => ({
    categoryId: row.category_id,
    payeeId: row.payee_id,
    uses: Number(row.uses),
  }));
}
