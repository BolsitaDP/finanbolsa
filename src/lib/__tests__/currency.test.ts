import { describe, expect, it } from "vitest";

import {
  buildRateIndex,
  convert,
  convertAll,
  describeMissingRate,
  missingRates,
  pairKey,
  rateFor,
  type RateRow,
} from "@/lib/currency";

/**
 * This module exists because the budget used to filter out every transaction
 * whose currency wasn't the base one — silently. A USD expense never came out
 * of a COP envelope and the app reported you were on budget. These tests pin the
 * two properties that prevent a return to that: a missing rate is reported,
 * never assumed, and the two directions of a pair can't disagree.
 */

const rows: RateRow[] = [
  { month: "2026-06", fromCurrency: "USD", toCurrency: "COP", rate: 4000 },
  { month: "2026-07", fromCurrency: "USD", toCurrency: "COP", rate: 4100 },
  { month: "2026-08", fromCurrency: "EUR", toCurrency: "COP", rate: 4400 },
];

describe("buildRateIndex", () => {
  const index = buildRateIndex(rows);

  it("indexes by month and pair", () => {
    expect(rateFor(index, "2026-06", "USD", "COP")).toBe(4000);
    expect(rateFor(index, "2026-07", "USD", "COP")).toBe(4100);
  });

  it("ignores non-positive rates rather than trusting them", () => {
    const bad = buildRateIndex([{ month: "2026-01", fromCurrency: "USD", toCurrency: "COP", rate: 0 }]);
    expect(rateFor(bad, "2026-01", "USD", "COP")).toBeNull();
  });
});

describe("rateFor", () => {
  const index = buildRateIndex(rows);

  it("returns 1 for a same-currency conversion, with no rate stored", () => {
    // COP -> COP is not a rate anyone has to enter.
    expect(rateFor(index, "2026-01", "COP", "COP")).toBe(1);
  });

  it("returns null when no rate exists at all", () => {
    expect(rateFor(index, "2026-06", "GBP", "COP")).toBeNull();
  });

  it("falls back to the most recent earlier month", () => {
    // Nobody wants to re-enter a TRM weekly; one rate covers its month.
    expect(rateFor(index, "2026-09", "USD", "COP")).toBe(4100);
  });

  it("never falls forward to a future month", () => {
    // Using a September rate to value June spending would retroactively change
    // numbers that were already reported.
    const futureOnly = buildRateIndex([
      { month: "2026-12", fromCurrency: "USD", toCurrency: "COP", rate: 5000 },
    ]);
    expect(rateFor(futureOnly, "2026-06", "USD", "COP")).toBeNull();
  });

  it("inverts a rate stored the other way round", () => {
    const inverse = buildRateIndex([
      { month: "2026-06", fromCurrency: "COP", toCurrency: "USD", rate: 0.00025 },
    ]);
    expect(rateFor(inverse, "2026-06", "USD", "COP")).toBe(4000);
  });
});

describe("convert", () => {
  const index = buildRateIndex(rows);

  it("converts using the month's rate", () => {
    expect(convert(50, "USD", "COP", index, "2026-06")).toBe(200_000);
    expect(convert(50, "USD", "COP", index, "2026-07")).toBe(205_000);
  });

  it("is a no-op for the same currency", () => {
    expect(convert(1234.56, "COP", "COP", index, "2026-06")).toBe(1234.56);
  });

  it("returns null rather than guessing when the rate is unknown", () => {
    // The whole point: a missing rate must be visible, not silently treated
    // as 1, which would make a USD expense look like 1 COP.
    expect(convert(50, "USD", "COP", index, "2025-01")).toBeNull();
  });
});

describe("missingRates", () => {
  const index = buildRateIndex(rows);

  it("reports nothing when every rate is known", () => {
    expect(
      missingRates(
        [
          { month: "2026-06", currency: "COP" },
          { month: "2026-06", currency: "USD" },
        ],
        index,
        "COP"
      )
    ).toEqual([]);
  });

  it("reports the exact pair and month that is missing", () => {
    const missing = missingRates([{ month: "2026-06", currency: "GBP" }], index, "COP");
    expect(missing).toEqual([{ month: "2026-06", from: "GBP", to: "COP" }]);
  });

  it("de-duplicates repeated amounts for the same month and pair", () => {
    // Fifty USD transactions in one month is one missing rate, not fifty.
    const many = Array.from({ length: 50 }, () => ({ month: "2026-06", currency: "GBP" }));
    expect(missingRates(many, index, "COP")).toHaveLength(1);
  });

  it("ignores the base currency itself", () => {
    expect(missingRates([{ month: "2026-06", currency: "COP" }], index, "COP")).toEqual([]);
  });

  it("sorts by month then currency", () => {
    const missing = missingRates(
      [
        { month: "2026-07", currency: "GBP" },
        { month: "2026-06", currency: "CHF" },
      ],
      buildRateIndex([]),
      "COP"
    );
    expect(missing.map((m) => `${m.month}/${m.from}`)).toEqual(["2026-06/CHF", "2026-07/GBP"]);
  });
});

describe("convertAll", () => {
  const index = buildRateIndex(rows);

  it("totals converted amounts and lists the rest separately", () => {
    const result = convertAll(
      [
        { month: "2026-06", currency: "USD", amount: 10 },
        { month: "2026-06", currency: "COP", amount: 100_000 },
        { month: "2026-06", currency: "GBP", amount: 5 },
      ],
      index,
      "COP"
    );

    // 10 USD = 40.000 COP, plus the 100.000 already in pesos. The GBP row is
    // NOT folded in at face value — that would quietly understate nothing and
    // overstate everything, which is worse.
    expect(result.total).toBe(140_000);
    expect(result.converted).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].currency).toBe("GBP");
  });

  it("never includes a skipped amount in the total", () => {
    const result = convertAll(
      [{ month: "2026-01", currency: "USD", amount: 999 }],
      index,
      "COP"
    );
    expect(result.total).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });
});

describe("pairKey", () => {
  it("is direction-sensitive, so the two directions cannot collide", () => {
    expect(pairKey("USD", "COP")).not.toBe(pairKey("COP", "USD"));
  });
});

describe("describeMissingRate", () => {
  it("renders a readable Spanish label", () => {
    expect(describeMissingRate({ month: "2026-08", from: "USD", to: "COP" })).toBe(
      "USD → COP en agosto de 2026"
    );
  });
});
