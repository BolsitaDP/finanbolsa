import { describe, expect, it } from "vitest";

import { monthlyAmounts, spendByCategoryForMonth, totalForMonth } from "@/lib/spending-stats";
import { groupSplitsByTransaction, type TransactionSplit } from "@/lib/splits";

/**
 * The totals behind the dashboard and the budget.
 *
 * `aggregates.test.ts` proves the SQL versions agree with these, so these are
 * the reference the SQL is checked against — which makes them worth getting
 * right on their own terms. Every one of these functions decides where money is
 * counted, and none of them can fail loudly: a wrong total is just a number
 * that looks believable.
 */

type Tx = Parameters<typeof totalForMonth>[0][number];

const tx = (overrides: Partial<Tx> = {}): Tx =>
  ({
    id: 1,
    date: new Date(2026, 7, 10),
    type: "expense",
    accountId: "acc-1",
    destinationAccountId: null,
    amountMinor: 10_000,
    currency: "COP",
    destinationAmountMinor: null,
    destinationCurrency: null,
    categoryId: "cat-mercado",
    payeeId: null,
    description: null,
    projectTrip: null,
    notes: null,
    importBatchId: null,
    createdAt: new Date(2026, 7, 10),
    updatedAt: new Date(2026, 7, 10),
    deletedAt: null,
    ...overrides,
  }) as Tx;

const split = (overrides: Partial<TransactionSplit> = {}): TransactionSplit => ({
  id: 1,
  transactionId: 1,
  amountMinor: 0,
  categoryId: null,
  payeeId: null,
  description: null,
  createdAt: new Date(0),
  ...overrides,
});

describe("totalForMonth", () => {
  it("sums only the requested month and type", () => {
    const txs = [
      tx({ amountMinor: 10_000, date: new Date(2026, 7, 5) }),
      tx({ amountMinor: 20_000, date: new Date(2026, 7, 20) }),
      tx({ amountMinor: 99_000, date: new Date(2026, 6, 20) }),
    ];

    expect(totalForMonth(txs, "2026-08", "expense").get("COP")).toBe(30_000);
  });

  it("keeps currencies apart instead of adding them", () => {
    // 10.000 pesos and 10 dólares are not 20.000 of anything.
    const txs = [
      tx({ amountMinor: 10_000, currency: "COP" }),
      tx({ id: 2, amountMinor: 10, currency: "USD" }),
    ];

    const totals = totalForMonth(txs, "2026-08", "expense");
    expect(totals.get("COP")).toBe(10_000);
    expect(totals.get("USD")).toBe(10);
    expect(totals.size).toBe(2);
  });

  it("ignores transfers, which are neither income nor spending", () => {
    const txs = [tx({ type: "transfer", amountMinor: 500_000 })];

    expect(totalForMonth(txs, "2026-08", "expense").size).toBe(0);
    expect(totalForMonth(txs, "2026-08", "income").size).toBe(0);
  });

  it("excludes income from the expense total and vice versa", () => {
    const txs = [tx({ type: "expense", amountMinor: 10_000 }), tx({ id: 2, type: "income", amountMinor: 90_000 })];

    expect(totalForMonth(txs, "2026-08", "expense").get("COP")).toBe(10_000);
    expect(totalForMonth(txs, "2026-08", "income").get("COP")).toBe(90_000);
  });

  it("counts a transaction on the last instant of the month", () => {
    // 23:59:59.999 on the 31st is still August. A UTC-based comparison would
    // drop it or move it, which is the class of bug in ROADMAP §3.1.
    const last = tx({ date: new Date(2026, 7, 31, 23, 59, 59, 999) });
    const next = tx({ id: 2, date: new Date(2026, 8, 1, 0, 0, 0, 0) });

    expect(totalForMonth([last], "2026-08", "expense").get("COP")).toBe(10_000);
    expect(totalForMonth([next], "2026-08", "expense").size).toBe(0);
    expect(totalForMonth([next], "2026-09", "expense").get("COP")).toBe(10_000);
  });

  it("returns an empty map for a month with nothing in it", () => {
    expect(totalForMonth([tx()], "2020-01", "expense").size).toBe(0);
  });
});

describe("spendByCategoryForMonth", () => {
  it("groups by category and currency, highest first", () => {
    const txs = [
      tx({ id: 1, categoryId: "cat-p-pequeno", amountMinor: 5_000 }),
      tx({ id: 2, categoryId: "cat-p-grande", amountMinor: 50_000 }),
      tx({ id: 3, categoryId: "cat-p-pequeno", amountMinor: 3_000 }),
    ];

    const rows = spendByCategoryForMonth(txs, "2026-08");

    expect(rows).toEqual([
      { categoryId: "cat-p-grande", currency: "COP", amountMinor: 50_000 },
      { categoryId: "cat-p-pequeno", currency: "COP", amountMinor: 8_000 },
    ]);
  });

  it("keeps the same category in two currencies as two rows", () => {
    const txs = [
      tx({ id: 1, categoryId: "cat-suscripciones", amountMinor: 10_000, currency: "COP" }),
      tx({ id: 2, categoryId: "cat-suscripciones", amountMinor: 10, currency: "USD" }),
    ];

    const rows = spendByCategoryForMonth(txs, "2026-08");

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.currency).sort()).toEqual(["COP", "USD"]);
  });

  it("skips uncategorised spending instead of inventing a category", () => {
    // Uncategorised spend still counts toward "how much did I spend"; it just
    // has no envelope, and the budget page has a link to find those rows.
    const txs = [tx({ categoryId: null, amountMinor: 10_000 }), tx({ id: 2, categoryId: "cat-a", amountMinor: 5_000 })];

    const rows = spendByCategoryForMonth(txs, "2026-08");

    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe("cat-a");
  });

  it("redistributes a split transaction across its categories", () => {
    const splitsByTx = groupSplitsByTransaction([
      split({ transactionId: 1, amountMinor: 30_000, categoryId: "cat-bebidas" }),
    ]);
    const txs = [tx({ id: 1, categoryId: "cat-retiro", amountMinor: 50_000 })];

    const rows = spendByCategoryForMonth(txs, "2026-08", splitsByTx);

    expect(rows).toEqual([
      { categoryId: "cat-bebidas", currency: "COP", amountMinor: 30_000 },
      { categoryId: "cat-retiro", currency: "COP", amountMinor: 20_000 },
    ]);
  });

  it("works with no splits argument at all", () => {
    // Callers that never deal with splits shouldn't have to pass an empty map;
    // a missing argument must behave exactly like "no splits".
    const txs = [tx({ id: 1, amountMinor: 5_000 }), tx({ id: 2, amountMinor: 7_000 })];

    expect(spendByCategoryForMonth(txs, "2026-08")).toEqual(
      spendByCategoryForMonth(txs, "2026-08", groupSplitsByTransaction([]))
    );
  });

  it("sums to the month's expense total, split or not", () => {
    // The invariant that ties this function to totalForMonth: attributing money
    // to categories may move it between them, never change the amount.
    const txs = [
      tx({ id: 1, categoryId: "cat-a", amountMinor: 10_000 }),
      tx({ id: 2, categoryId: null, amountMinor: 4_000 }),
      tx({ id: 3, categoryId: "cat-retiro", amountMinor: 50_000, date: new Date(2026, 7, 12) }),
    ];
    const splitsByTx = groupSplitsByTransaction([
      split({ transactionId: 3, amountMinor: 30_000, categoryId: "cat-bebidas" }),
    ]);

    const attributed = spendByCategoryForMonth(txs, "2026-08", splitsByTx).reduce(
      (sum, row) => sum + row.amountMinor,
      0
    );
    const total = totalForMonth(txs, "2026-08", "expense").get("COP")!;

    // The uncategorised row is not attributable, so attributed is lower by
    // exactly that amount — never higher.
    expect(attributed).toBe(total - 4_000);
  });

  it("returns nothing for a month with no spending", () => {
    expect(spendByCategoryForMonth([tx()], "2020-01")).toEqual([]);
  });
});

describe("monthlyAmounts", () => {
  it("zero-fills the months with no activity instead of skipping them", () => {
    // A trend chart that omits a quiet month draws it as no data, which reads
    // as "we have no data" rather than "nothing happened". The gap has to be a
    // visible zero.
    const series = monthlyAmounts(
      [
        { date: new Date(), amountMinor: 5_000 },
        { date: new Date(), amountMinor: 2_000 },
      ],
      4
    );

    expect(series).toHaveLength(4);
    expect(series.map((p) => p.amountMinor)).toEqual([0, 0, 0, 7_000]);
  });

  it("runs oldest first, ending on the current month", () => {
    const series = monthlyAmounts([], 3);

    expect(series).toHaveLength(3);
    expect(series[2].month).toBe(
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
    );
    for (let i = 1; i < series.length; i++) {
      expect(series[i].month > series[i - 1].month, "los meses van en orden").toBe(true);
    }
  });

  it("ignores entries older than the window", () => {
    const series = monthlyAmounts(
      [
        { date: new Date(2000, 0, 1), amountMinor: 999_999 },
        { date: new Date(), amountMinor: 1_000 },
      ],
      3
    );

    expect(series.reduce((sum, p) => sum + p.amountMinor, 0)).toBe(1_000);
  });

  it("does not filter by type or currency, because its caller already did", () => {
    // It is fed split allocations, which are not transaction rows at all. The
    // counting has to be whatever the caller put in.
    const series = monthlyAmounts([{ date: new Date(), amountMinor: 7_000 }], 1);

    expect(series[0].amountMinor).toBe(7_000);
  });

  it("returns a single zero point when asked for one month", () => {
    expect(monthlyAmounts([], 1)).toEqual([
      { month: monthlyAmounts([], 1)[0].month, amountMinor: 0 },
    ]);
  });
});
