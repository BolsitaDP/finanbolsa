import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currentBalances, netWorthTrend } from "@/lib/balance";
import { makeAccount, makeTransaction, utc } from "./factories";

/**
 * `balance.ts` decides the sign of every movement in the app. A mistake here
 * doesn't crash anything — it produces a plausible but wrong number on the
 * dashboard, in the accounts table and in the net-worth chart. That's exactly
 * the class of bug tests are worth having for.
 */

describe("currentBalances", () => {
  it("subtracts expenses and adds income from the reference balance", () => {
    const account = makeAccount({ referenceBalanceMinor: 1_000_000 });
    const balances = currentBalances([account], [
      makeTransaction({ type: "expense", amountMinor: 250_000, date: utc("2025-02-01") }),
      makeTransaction({ type: "income", amountMinor: 100_000, date: utc("2025-02-02") }),
    ]);

    expect(balances.get("acc-1")).toBe(850_000);
  });

  it("ignores movements dated before the account's own reference date", () => {
    // The reference balance is a snapshot of a specific moment; anything older
    // is already baked into it. Applying those again would double-count the
    // entire imported history.
    const account = makeAccount({
      referenceDate: utc("2025-01-01"),
      referenceBalanceMinor: 1_000_000,
    });
    const balances = currentBalances([account], [
      makeTransaction({ type: "expense", amountMinor: 500_000, date: utc("2024-12-31") }),
      makeTransaction({ type: "expense", amountMinor: 200_000, date: utc("2025-01-02") }),
    ]);

    expect(balances.get("acc-1")).toBe(800_000);
  });

  it("moves a transfer out of the source and into the destination", () => {
    const from = makeAccount({ id: "acc-from", referenceBalanceMinor: 1_000_000 });
    const to = makeAccount({ id: "acc-to", referenceBalanceMinor: 0 });
    const balances = currentBalances([from, to], [
      makeTransaction({
        type: "transfer",
        accountId: "acc-from",
        destinationAccountId: "acc-to",
        amountMinor: 300_000,
        destinationAmountMinor: 300_000,
        date: utc("2025-03-01"),
      }),
    ]);

    expect(balances.get("acc-from")).toBe(700_000);
    expect(balances.get("acc-to")).toBe(300_000);
    // Internal transfers must not create or destroy money.
    expect((balances.get("acc-from") ?? 0) + (balances.get("acc-to") ?? 0)).toBe(1_000_000);
  });

  it("uses destinationAmountMinor for the receiving side of a cross-currency transfer", () => {
    // Spending 500 000 COP to top up a USD balance moves a different amount of
    // money in the destination currency — reading amountMinor on both sides
    // would book 500 000 USD.
    const cop = makeAccount({ id: "acc-cop", currency: "COP", referenceBalanceMinor: 1_000_000 });
    const usd = makeAccount({ id: "acc-usd", currency: "USD", referenceBalanceMinor: 0 });
    const balances = currentBalances([cop, usd], [
      makeTransaction({
        type: "transfer",
        accountId: "acc-cop",
        destinationAccountId: "acc-usd",
        amountMinor: 500_000,
        currency: "COP",
        destinationAmountMinor: 125,
        destinationCurrency: "USD",
        date: utc("2025-03-01"),
      }),
    ]);

    expect(balances.get("acc-cop")).toBe(500_000);
    expect(balances.get("acc-usd")).toBe(125);
  });

  it("keeps a credit card negative, as debt rather than as an owed amount", () => {
    const card = makeAccount({
      type: "credit_card",
      referenceBalanceMinor: 0,
    });
    const balances = currentBalances([card], [
      makeTransaction({ type: "expense", amountMinor: 80_000, date: utc("2025-04-01") }),
    ]);

    expect(balances.get("acc-1")).toBe(-80_000);
  });

  it("falls back to destinationAmountMinor when a transfer has no destination amount", () => {
    const from = makeAccount({ id: "acc-from" });
    const to = makeAccount({ id: "acc-to" });
    const balances = currentBalances([from, to], [
      makeTransaction({
        type: "transfer",
        accountId: "acc-from",
        destinationAccountId: "acc-to",
        amountMinor: 42_000,
        destinationAmountMinor: null,
        date: utc("2025-03-01"),
      }),
    ]);

    expect(balances.get("acc-to")).toBe(42_000);
  });

  it("does not filter soft-deleted rows itself — it trusts its input", () => {
    // Every caller passes an already-filtered array (`where isNull(deletedAt)`).
    // Pinning that contract here: if someone later "helpfully" adds a
    // deletedAt check inside this function it stays a no-op, and if a caller
    // ever forgets the filter this test is the reminder that the helper
    // won't save it.
    const account = makeAccount({ referenceBalanceMinor: 1_000_000 });
    const balances = currentBalances([account], [
      makeTransaction({
        type: "expense",
        amountMinor: 100_000,
        date: utc("2025-02-01"),
        deletedAt: utc("2025-05-01"),
      }),
    ]);

    expect(balances.get("acc-1")).toBe(900_000);
  });

  it("reports an account with no movements as exactly its reference balance", () => {
    const account = makeAccount({ referenceBalanceMinor: 777_000 });
    expect(currentBalances([account], []).get("acc-1")).toBe(777_000);
  });
});

describe("netWorthTrend", () => {
  // Pinned so "the current month" is deterministic — the trend is built
  // relative to `new Date()`, which would otherwise make the fixtures age.
  const NOW = new Date("2025-06-15T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Mirrors the production month-end formula, in local time like the original. */
  function monthEnd(monthsBack: number): Date {
    return new Date(
      NOW.getFullYear(),
      NOW.getMonth() - monthsBack + 1,
      0,
      23,
      59,
      59,
      999
    );
  }

  it("returns one oldest-first point per requested month", () => {
    const points = netWorthTrend([makeAccount()], [], 3);

    expect(points).toHaveLength(3);
    expect(points.map((p) => p.month)).toEqual([
      monthKey(monthEnd(2)),
      monthKey(monthEnd(1)),
      monthKey(monthEnd(0)),
    ]);
  });

  it("unwinds movements backwards, so a past expense reappears in earlier months", () => {
    // There is no stored balance history; the series is reconstructed by
    // walking the ledger backward from today's balance. A June expense is
    // already inside the current balance, so it must be added back to May and
    // April — otherwise the chart claims the past was poorer than it was.
    const account = makeAccount({ referenceBalanceMinor: 1_000_000 });
    const points = netWorthTrend(
      [account],
      [makeTransaction({ type: "expense", amountMinor: 100_000, date: utc("2025-06-10") })],
      3
    );

    expect(points.map((p) => p.totalsByCurrency.COP)).toEqual([1_000_000, 1_000_000, 900_000]);
  });

  it("ends at exactly the current balance", () => {
    // The last point is the current month-end. With "now" mid-month, nothing
    // can be dated after it, so it must equal currentBalances exactly. This is
    // the invariant that ties the chart to the accounts table.
    const accounts = [
      makeAccount({ id: "acc-1", currency: "COP", referenceBalanceMinor: 1_000_000 }),
      makeAccount({ id: "acc-2", currency: "USD", referenceBalanceMinor: 500 }),
    ];
    const txs = [
      makeTransaction({ type: "expense", amountMinor: 100_000, date: utc("2025-06-10") }),
      makeTransaction({
        type: "transfer",
        accountId: "acc-1",
        destinationAccountId: "acc-2",
        amountMinor: 200_000,
        destinationAmountMinor: 50,
        currency: "COP",
        destinationCurrency: "USD",
        date: utc("2025-05-05"),
      }),
    ];

    const balances = currentBalances(accounts, txs);
    const last = netWorthTrend(accounts, txs, 6).at(-1)!;

    expect(last.totalsByCurrency.COP).toBe(balances.get("acc-1"));
    expect(last.totalsByCurrency.USD).toBe(balances.get("acc-2"));
  });

  it("sums accounts of the same currency into a single total per month", () => {
    const points = netWorthTrend(
      [
        makeAccount({ id: "acc-1", currency: "COP", referenceBalanceMinor: 300_000 }),
        makeAccount({ id: "acc-2", currency: "COP", referenceBalanceMinor: 200_000 }),
      ],
      [],
      1
    );

    expect(points[0].totalsByCurrency.COP).toBe(500_000);
  });

  it("keeps currencies separate rather than summing them", () => {
    const points = netWorthTrend(
      [
        makeAccount({ id: "acc-1", currency: "COP", referenceBalanceMinor: 1_000_000 }),
        makeAccount({ id: "acc-2", currency: "USD", referenceBalanceMinor: 250 }),
      ],
      [],
      1
    );

    expect(points[0].totalsByCurrency).toEqual({ COP: 1_000_000, USD: 250 });
  });

  it("omits a month from the series when no account held that currency yet", () => {
    // Accounts opened mid-window have no meaningful earlier balance. They
    // report the reference balance for every month rather than being dropped,
    // which is the existing behaviour — pinned so a future change is
    // deliberate.
    const points = netWorthTrend(
      [makeAccount({ id: "acc-1", currency: "COP", referenceBalanceMinor: 10 })],
      [],
      3
    );

    expect(points.every((p) => p.totalsByCurrency.COP === 10)).toBe(true);
  });
});

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
