import { describe, expect, it } from "vitest";

import { detectRecurring } from "@/lib/recurring";
import { makeTransaction, utc } from "./factories";

/**
 * `recurring.ts` is a heuristic: it guesses which repeated charges are
 * subscriptions. Both failure directions are user-visible, so both are pinned
 * here — a supermarket flagged as a fixed monthly cost, or a real Netflix
 * subscription dropped because its price moved.
 */

const payees = new Map([["payee-netflix", "Netflix"]]);

/** One charge per month, same amount — the unambiguous subscription shape. */
function monthlyExpenses(count: number, amountMinor: number, payeeId = "payee-netflix") {
  const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  return months.slice(0, count).map((month, i) =>
    makeTransaction({
      date: utc(`${month}-10`),
      type: "expense",
      amountMinor,
      payeeId,
      description: `COMPRA NETFLIX ${i}`,
    })
  );
}

describe("detectRecurring", () => {
  it("flags a charge that repeats at a stable amount across three months", () => {
    const groups = detectRecurring(monthlyExpenses(3, 50_000), payees);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      label: "Netflix",
      currency: "COP",
      monthsSeen: 3,
      transactionCount: 3,
      averageAmountMinor: 50_000,
      totalAmountMinor: 150_000,
    });
  });

  it("requires at least three distinct months, not three transactions", () => {
    // Three charges inside one month is a frequent stop, not a subscription.
    const txs = ["01", "08", "15"].map((day) =>
      makeTransaction({
        date: utc(`2025-03-${day}`),
        type: "expense",
        amountMinor: 50_000,
        payeeId: "payee-netflix",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });

  it("excludes a merchant with wildly variable amounts", () => {
    // The supermarket case. Amounts of 10k / 100k / 200k have a coefficient of
    // variation around 0.75, well past the 0.35 ceiling — flagging this as a
    // fixed monthly cost would be plainly wrong.
    const txs = [10_000, 100_000, 200_000].map((amountMinor, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-05`),
        type: "expense",
        amountMinor,
        payeeId: "payee-groceries",
        description: "SUPERMERCADO",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });

  it("tolerates FX drift on a subscription billed in another currency", () => {
    // A USD plan charged in COP drifts with the exchange rate. 195k–205k around
    // a 200k mean is a ~2% spread and must still read as fixed, otherwise every
    // dollar subscription silently drops out of the recurring report.
    const txs = [200_000, 205_000, 195_000].map((amountMinor, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-10`),
        type: "expense",
        amountMinor,
        payeeId: "payee-netflix",
        description: "NETFLIX",
      })
    );

    const groups = detectRecurring(txs, payees);

    expect(groups).toHaveLength(1);
    expect(groups[0].averageAmountMinor).toBeCloseTo(200_000);
  });

  it("ignores income and transfers", () => {
    const txs = [
      ...monthlyExpenses(3, 50_000),
      // A monthly salary would otherwise look like the most stable "recurring"
      // charge in the data.
      ...[1, 2, 3].map((m) =>
        makeTransaction({
          date: utc(`2025-0${m}-01`),
          type: "income",
          amountMinor: 5_000_000,
          payeeId: "payee-empleador",
        })
      ),
      ...[1, 2, 3].map((m) =>
        makeTransaction({
          date: utc(`2025-0${m}-02`),
          type: "transfer",
          amountMinor: 1_000_000,
          payeeId: "payee-ahorro",
        })
      ),
    ];

    const groups = detectRecurring(txs, payees);

    expect(groups.map((g) => g.key)).toEqual(["payee:payee-netflix"]);
  });

  it("groups by payee even when the raw description varies", () => {
    // The same merchant described three different ways in three statements
    // should be one group, not three misses.
    const txs = ["COMPRA EN NETFLIX", "NETFLIX.COM", "PAGO NETFLIX 8842"].map(
      (description, i) =>
        makeTransaction({
          date: utc(`2025-0${i + 1}-10`),
          type: "expense",
          amountMinor: 50_000,
          payeeId: "payee-netflix",
          description,
        })
    );

    const groups = detectRecurring(txs, payees);

    expect(groups).toHaveLength(1);
    expect(groups[0].transactionCount).toBe(3);
  });

  it("falls back to the lowercased description when no payee is set", () => {
    const txs = ["  Spotify ", "SPOTIFY", "spotify"].map((description, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-10`),
        type: "expense",
        amountMinor: 30_000,
        payeeId: null,
        description,
      })
    );

    const groups = detectRecurring(txs, payees);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("desc:spotify");
  });

  it("skips transactions with neither a payee nor a description", () => {
    // Nothing to group on, so there is nothing to conclude.
    const txs = [1, 2, 3].map((m) =>
      makeTransaction({
        date: utc(`2025-0${m}-10`),
        type: "expense",
        amountMinor: 30_000,
        payeeId: null,
        description: null,
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });

  it("picks the most frequent category as the group's category", () => {
    const txs = [
      ...["2025-01", "2025-02"].map((month) =>
        makeTransaction({
          date: utc(`${month}-10`),
          type: "expense",
          amountMinor: 50_000,
          payeeId: "payee-netflix",
          categoryId: "cat-entretenimiento",
        })
      ),
      makeTransaction({
        date: utc("2025-03-10"),
        type: "expense",
        amountMinor: 50_000,
        payeeId: "payee-netflix",
        categoryId: "cat-servicios",
      }),
    ];

    expect(detectRecurring(txs, payees)[0].categoryId).toBe("cat-entretenimiento");
  });

  it("reports null category when the group has no categorised transactions", () => {
    const groups = detectRecurring(monthlyExpenses(3, 50_000), payees);

    expect(groups[0].categoryId).toBeNull();
  });

  it("sorts by average amount, largest first", () => {
    const txs = [
      ...monthlyExpenses(3, 30_000),
      ...["2025-01", "2025-02", "2025-03"].map((month) =>
        makeTransaction({
          date: utc(`${month}-10`),
          type: "expense",
          amountMinor: 900_000,
          payeeId: "payee-arriendo",
          description: "ARRIENDO",
        })
      ),
    ];

    const groups = detectRecurring(txs, new Map([["payee-arriendo", "Arriendo"]]));

    expect(groups.map((g) => g.key)).toEqual(["payee:payee-arriendo", "payee:payee-netflix"]);
  });

  it("treats a zero-mean group as perfectly stable rather than dividing by zero", () => {
    // A 0/0 coefficient of variation would be NaN, and `NaN > 0.35` is false —
    // so a group of zero-value charges silently counts as recurring. Pinned so
    // the guard is intentional rather than accidental.
    const txs = [1, 2, 3].map((m) =>
      makeTransaction({
        date: utc(`2025-0${m}-10`),
        type: "expense",
        amountMinor: 0,
        payeeId: "payee-cortesia",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(1);
  });
});
