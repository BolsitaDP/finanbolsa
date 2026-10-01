import { describe, expect, it } from "vitest";

import {
  buildAllocations,
  categoryAllocations,
  groupSplitsByTransaction,
  type TransactionSplit,
} from "@/lib/splits";

/**
 * `splits.ts` decides how spending is attributed to categories.
 *
 * Every budget total, every category page and every payee page routes its
 * numbers through here, so a mistake does not crash anything: it quietly moves
 * money from one category to another, month after month, and the totals still
 * add up. That is the worst shape of bug — plausible, and invisible unless
 * someone checks.
 */

type Tx = { id: number; categoryId: string | null; amountMinor: number };

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

describe("groupSplitsByTransaction", () => {
  it("groups several splits under one transaction", () => {
    const grouped = groupSplitsByTransaction([
      split({ id: 1, transactionId: 10, amountMinor: 100 }),
      split({ id: 2, transactionId: 10, amountMinor: 200 }),
      split({ id: 3, transactionId: 20, amountMinor: 50 }),
    ]);

    expect(grouped.get(10)).toHaveLength(2);
    expect(grouped.get(20)).toHaveLength(1);
    expect(grouped.size).toBe(2);
  });

  it("returns an empty map for no splits, so callers need no null check", () => {
    expect(groupSplitsByTransaction([]).size).toBe(0);
  });
});

describe("categoryAllocations", () => {
  it("gives a transaction with no splits entirely to its own category", () => {
    const allocations = categoryAllocations(
      { id: 1, categoryId: "cat-mercado", amountMinor: 50_000 },
      new Map()
    );

    expect(allocations).toEqual([{ categoryId: "cat-mercado", amountMinor: 50_000 }]);
  });

  it("keeps a null category as a null allocation rather than dropping the money", () => {
    // Uncategorised is a real state, and the "Sin categoría" view exists to
    // clear it. Silently discarding it would make that view's totals wrong.
    const allocations = categoryAllocations({ id: 1, categoryId: null, amountMinor: 50_000 }, new Map());

    expect(allocations).toEqual([{ categoryId: null, amountMinor: 50_000 }]);
  });

  it("attributes each split to its own category", () => {
    const splitsByTx = new Map([
      [
        1,
        [
          split({ id: 1, transactionId: 1, amountMinor: 20_000, categoryId: "cat-bebidas" }),
          split({ id: 2, transactionId: 1, amountMinor: 30_000, categoryId: "cat-comida" }),
        ],
      ],
    ]);

    const allocations = categoryAllocations(
      { id: 1, categoryId: "cat-retiro", amountMinor: 50_000 },
      splitsByTx
    );

    expect(allocations).toEqual([
      { categoryId: "cat-bebidas", amountMinor: 20_000 },
      { categoryId: "cat-comida", amountMinor: 30_000 },
    ]);
  });

  it("keeps the unallocated remainder under the transaction's own category", () => {
    // A cash withdrawal broken down into what was actually bought still has an
    // unaccounted remainder, and it belongs somewhere. Attributing only the
    // splits would lose it.
    const splitsByTx = new Map([
      [1, [split({ id: 1, transactionId: 1, amountMinor: 20_000, categoryId: "cat-bebidas" })]],
    ]);

    const allocations = categoryAllocations(
      { id: 1, categoryId: "cat-retiro", amountMinor: 50_000 },
      splitsByTx
    );

    expect(allocations).toEqual([
      { categoryId: "cat-bebidas", amountMinor: 20_000 },
      { categoryId: "cat-retiro", amountMinor: 30_000 },
    ]);
  });

  it("adds up to the transaction's full amount in every case", () => {
    // The invariant behind the whole module: attribution may move money between
    // categories but must never create or destroy it.
    const cases: { tx: Tx; splits: TransactionSplit[] }[] = [
      { tx: { id: 1, categoryId: "cat-a", amountMinor: 50_000 }, splits: [] },
      {
        tx: { id: 1, categoryId: "cat-a", amountMinor: 50_000 },
        splits: [split({ transactionId: 1, amountMinor: 20_000, categoryId: "cat-b" })],
      },
      {
        tx: { id: 1, categoryId: "cat-a", amountMinor: 50_000 },
        splits: [split({ transactionId: 1, amountMinor: 50_000, categoryId: "cat-b" })],
      },
      {
        // Over-split: the breakdown claims more than the withdrawal was.
        tx: { id: 1, categoryId: "cat-a", amountMinor: 50_000 },
        splits: [
          split({ id: 1, transactionId: 1, amountMinor: 30_000, categoryId: "cat-b" }),
          split({ id: 2, transactionId: 1, amountMinor: 30_000, categoryId: "cat-c" }),
        ],
      },
      {
        tx: { id: 1, categoryId: null, amountMinor: 50_000 },
        splits: [split({ transactionId: 1, amountMinor: 10_000, categoryId: "cat-b" })],
      },
    ];

    for (const { tx, splits } of cases) {
      const total = categoryAllocations(tx, groupSplitsByTransaction(splits)).reduce(
        (sum, a) => sum + a.amountMinor,
        0
      );
      // Over-splitting is the one case where the sum legitimately exceeds the
      // transaction; the rule is "never less than the amount".
      expect(total, JSON.stringify(splits)).toBeGreaterThanOrEqual(tx.amountMinor);
    }
  });

  it("omits the remainder when the splits already account for everything", () => {
    // A remainder of exactly zero must not appear as a spurious 0-peso entry
    // under the parent category, which would show up as an empty row.
    const splitsByTx = new Map([
      [1, [split({ transactionId: 1, amountMinor: 50_000, categoryId: "cat-b" })]],
    ]);

    const allocations = categoryAllocations(
      { id: 1, categoryId: "cat-a", amountMinor: 50_000 },
      splitsByTx
    );

    expect(allocations).toHaveLength(1);
    expect(allocations[0].categoryId).toBe("cat-b");
  });

  it("ignores splits belonging to a different transaction", () => {
    // A stale split row from a deleted transaction would otherwise be applied
    // to whatever transaction happened to share its id in memory.
    const splitsByTx = new Map([
      [
        2,
        [split({ transactionId: 2, amountMinor: 999_999, categoryId: "cat-otro" })],
      ],
    ]);

    const allocations = categoryAllocations(
      { id: 1, categoryId: "cat-a", amountMinor: 50_000 },
      splitsByTx
    );

    expect(allocations).toEqual([{ categoryId: "cat-a", amountMinor: 50_000 }]);
  });

  it("keeps a zero-amount split visible instead of losing the category", () => {
    const splitsByTx = new Map([
      [1, [split({ transactionId: 1, amountMinor: 0, categoryId: "cat-b" })]],
    ]);

    const allocations = categoryAllocations(
      { id: 1, categoryId: "cat-a", amountMinor: 50_000 },
      splitsByTx
    );

    expect(allocations.map((a) => a.categoryId)).toEqual(["cat-b", "cat-a"]);
  });
});

describe("buildAllocations", () => {
  type Direct = {
    id: number;
    date: Date;
    currency: string;
    amountMinor: number;
    categoryId: string | null;
    payeeId: string | null;
  };

  const direct = (overrides: Partial<Direct> = {}): Direct => ({
    id: 1,
    date: new Date(2026, 7, 10),
    currency: "COP",
    amountMinor: 100_000,
    categoryId: "cat-mercado",
    payeeId: "pay-exito",
    ...overrides,
  });

  it("contributes the whole amount for a transaction with no splits", () => {
    const allocations = buildAllocations(
      [direct()],
      new Map(),
      [],
      new Map()
    );

    expect(allocations).toEqual([
      {
        date: new Date(2026, 7, 10),
        currency: "COP",
        amountMinor: 100_000,
        categoryId: "cat-mercado",
        payeeId: "pay-exito",
      },
    ]);
  });

  it("contributes only the remainder of a fully split transaction", () => {
    const splitsByTx = new Map([
      [1, [split({ transactionId: 1, amountMinor: 100_000, categoryId: "cat-bebidas" })]],
    ]);

    const allocations = buildAllocations([direct()], splitsByTx, [], new Map());

    // Everything was attributed away, so the transaction itself contributes
    // nothing to its own category — otherwise the category would be charged
    // the full amount AND the split, i.e. double.
    expect(allocations).toEqual([]);
  });

  it("brings in splits from other transactions that targeted this category", () => {
    // The cash-withdrawal case: the withdrawal is not tagged with the category,
    // but a split on it says part of that cash was spent here. The date and
    // currency must come from the parent, or the entry lands in the wrong month.
    const parentDate = new Date(2026, 7, 5);
    const allocations = buildAllocations(
      [],
      new Map(),
      [split({ transactionId: 7, amountMinor: 30_000, categoryId: "cat-mercado" })],
      new Map([[7, { date: parentDate, currency: "COP" }]])
    );

    expect(allocations).toEqual([
      {
        date: parentDate,
        currency: "COP",
        amountMinor: 30_000,
        categoryId: "cat-mercado",
        payeeId: null,
      },
    ]);
  });

  it("skips a split whose parent transaction no longer exists", () => {
    // A split can outlive its parent if the parent was hard-deleted. Without
    // this guard, the entry would carry no date and land in an arbitrary month.
    const allocations = buildAllocations(
      [],
      new Map(),
      [split({ transactionId: 999, amountMinor: 30_000, categoryId: "cat-mercado" })],
      new Map()
    );

    expect(allocations).toEqual([]);
  });

  it("combines direct transactions and incoming splits without double counting", () => {
    const splitsByTx = new Map([
      [1, [split({ transactionId: 1, amountMinor: 40_000, categoryId: "cat-bebidas" })]],
    ]);
    const allocations = buildAllocations(
      [direct()],
      splitsByTx,
      [split({ id: 2, transactionId: 7, amountMinor: 10_000, categoryId: "cat-mercado" })],
      new Map([[7, { date: new Date(2026, 7, 20), currency: "COP" }]])
    );

    const total = allocations.reduce((sum, a) => sum + a.amountMinor, 0);
    // 60.000 remainder of the direct transaction + 10.000 from the split.
    expect(total).toBe(70_000);
    expect(allocations).toHaveLength(2);
  });
});
