import { describe, expect, it } from "vitest";
import { isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  accounts as accountsTable,
  payees as payeesTable,
  transactionSplits,
  transactions as transactionsTable,
} from "@/db/schema";
import {
  currentBalances as currentBalancesSql,
  movementByAccountAndMonth,
  recurringCandidates,
  spendByCategoryInMonth,
  totalsByMonth,
  totalsFor,
} from "@/lib/aggregates";
import { currentBalances, netWorthTrend, netWorthTrendFromMonthly } from "@/lib/balance";
import { detectRecurring } from "@/lib/recurring";
import { spendByCategoryForMonth, totalForMonth } from "@/lib/spending-stats";
import { groupSplitsByTransaction } from "@/lib/splits";
import { monthKey, shiftMonth } from "@/lib/month";

/**
 * Parity between the SQL aggregates and the JavaScript they replaced.
 *
 * Every function in `aggregates.ts` exists only to be faster than the readable
 * version in `balance.ts` / `spending-stats.ts`. Faster is worthless if it
 * answers differently, so each case here loads the real database and asserts
 * the two agree exactly.
 *
 * These run against data/finanbolsa.db rather than a fixture on purpose: a
 * hand-built fixture only proves the aggregate matches on the cases somebody
 * thought of. The real ledger has transfers with no destination amount,
 * uncategorised rows, a split cash withdrawal and 504 rows with no category —
 * exactly the shapes that break a rewritten aggregate.
 */

/**
 * Money is stored as a double, so a sum depends on the order the terms are
 * added: JS adds row by row in scan order, SQLite adds in its own. The two
 * can land a few ULPs apart on the same data (284.69999999999993 vs 284.7).
 * That is arithmetic noise, not a different answer, so amounts are compared
 * with a tolerance while every CATEGORY, CURRENCY and KEY is still compared
 * exactly — a misattributed peso has to fail the test.
 */
const TOLERANCE = 1e-6;

function expectSameKeys(
  label: string,
  expected: Iterable<string>,
  actual: Iterable<string>
) {
  expect([...actual].sort(), `${label}: same set of keys`).toEqual([...expected].sort());
}

function expectSameAmounts(
  label: string,
  expected: Map<string, number>,
  actual: Map<string, number>
) {
  expectSameKeys(label, expected.keys(), actual.keys());
  for (const [key, value] of expected) {
    expect(Math.abs(actual.get(key)! - value), `${label} ${key}`).toBeLessThanOrEqual(
      TOLERANCE * Math.max(1, Math.abs(value))
    );
  }
}

const allTransactions = () =>
  db.select().from(transactionsTable).where(isNull(transactionsTable.deletedAt));
const allAccounts = () => db.select().from(accountsTable);
const allSplits = () => db.select().from(transactionSplits);

const TREND_MONTHS = 12;

async function monthsWithActivity(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ month: monthKeyRef })
    .from(transactionsTable)
    .where(isNull(transactionsTable.deletedAt));
  return rows.map((row) => row.month).sort();
}

// Reuses the same SQL expression the aggregates use, so the test asks about
// the same month buckets they do rather than a JS reimplementation of them.
const { transactionMonth: monthKeyRef } = await import("@/lib/month-sql");

describe("totalsByMonth", () => {
  it("matches totalForMonth for every month with activity, both types, every currency", async () => {
    const months = await monthsWithActivity();
    expect(months.length).toBeGreaterThan(0);

    const txs = await allTransactions();
    const sqlTotals = await totalsByMonth(months);

    for (const month of months) {
      for (const type of ["expense", "income"] as const) {
        expectSameAmounts(
          `${month}/${type}`,
          totalForMonth(txs, month, type),
          totalsFor(sqlTotals, month, type)
        );
      }
    }
  });

  it("returns nothing for an empty month list instead of scanning", async () => {
    expect((await totalsByMonth([])).size).toBe(0);
  });
});

describe("currentBalances", () => {
  it("matches the JS walk for every account, including the transfer destinations", async () => {
    const [txs, accountRows, fromSql] = await Promise.all([
      allTransactions(),
      allAccounts(),
      currentBalancesSql(),
    ]);
    const fromJs = currentBalances(accountRows, txs);

    expect(Object.fromEntries(fromSql)).toEqual(Object.fromEntries(fromJs));
  });

  it("covers every account, including ones with no movements at all", async () => {
    const accountRows = await allAccounts();
    const fromSql = await currentBalancesSql();
    for (const account of accountRows) {
      expect(fromSql.has(account.id)).toBe(true);
    }
  });
});

describe("netWorthTrendFromMonthly", () => {
  it("matches the per-transaction walk, month by month and currency by currency", async () => {
    const [txs, accountRows, balances] = await Promise.all([
      allTransactions(),
      allAccounts(),
      currentBalancesSql(),
    ]);
    const thisMonth = monthKey(new Date());
    const from = shiftMonth(thisMonth, -(TREND_MONTHS - 1));

    const expected = netWorthTrend(accountRows, txs, TREND_MONTHS);
    const actual = netWorthTrendFromMonthly(
      accountRows,
      balances,
      await movementByAccountAndMonth(from, thisMonth),
      TREND_MONTHS
    );

    expect(actual).toEqual(expected);
  });
});

describe("spendByCategoryInMonth", () => {
  it("matches the JS attribution for every month with activity", async () => {
    const [months, txs, splits] = await Promise.all([
      monthsWithActivity(),
      allTransactions(),
      allSplits(),
    ]);
    const splitsByTx = groupSplitsByTransaction(splits);

    for (const month of months) {
      const expected = spendByCategoryForMonth(txs, month, splitsByTx);
      const actual = await spendByCategoryInMonth(month);
      // Same order on both sides (both sort highest first), so a difference in
      // the array itself is a difference in attribution, not in sorting.
      expectSameKeys(
        `${month} categories`,
        expected.map((c) => `${c.categoryId}|${c.currency}`),
        actual.map((c) => `${c.categoryId}|${c.currency}`)
      );
      expectSameAmounts(
        `${month} amounts`,
        new Map(expected.map((c) => [`${c.categoryId}|${c.currency}`, c.amountMinor])),
        new Map(actual.map((c) => [`${c.categoryId}|${c.currency}`, c.amountMinor]))
      );
    }
  });
});

describe("recurringCandidates", () => {
  it("finds the same recurring charges as feeding detectRecurring every row", async () => {
    const [txs, payeeRows, candidates] = await Promise.all([
      allTransactions(),
      db.select().from(payeesTable),
      recurringCandidates(),
    ]);
    const payeeName = new Map(payeeRows.map((p) => [p.id, p.name]));

    // The old path: every transaction, as the page used to fetch them.
    const expected = detectRecurring(txs, payeeName);
    const actual = detectRecurring(candidates, payeeName);
    expect(actual).toEqual(expected);
  });

  it("never sends a row detection would have thrown away", async () => {
    const candidates = await recurringCandidates();
    for (const row of candidates) {
      // detectRecurring skips anything with no payee AND no description, and
      // anything that is not an expense — so neither may appear here.
      expect(row.payeeId || row.description).toBeTruthy();
    }
  });
});
