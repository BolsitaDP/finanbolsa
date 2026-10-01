import { describe, expect, it } from "vitest";

import { monthKey, monthLabel, monthStart, shiftMonth } from "@/lib/month";

/**
 * `month.ts` is the module everything buckets by, and it is the reason
 * `recurring.ts` and the budget page can disagree about which month a
 * transaction belongs to (recurring.ts uses UTC, this uses local time). Small,
 * pure, and load-bearing — so it gets tests even though it used to be four
 * one-liners.
 */

describe("monthKey", () => {
  it("zero-pads the month", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKey(new Date(2026, 8, 30))).toBe("2026-09");
    expect(monthKey(new Date(2026, 11, 31))).toBe("2026-12");
  });

  it("uses local time, which is what the rest of the UI assumes", () => {
    // Late-evening local on the last day of a month. In UTC this can already be
    // the next month — the mismatch that puts a transaction in different months
    // depending on which page you ask.
    expect(monthKey(new Date(2026, 8, 30, 23, 30))).toBe("2026-09");
    expect(monthKey(new Date(2026, 9, 1, 0, 30))).toBe("2026-10");
  });
});

describe("monthStart", () => {
  it("returns the first instant of the month", () => {
    const d = monthStart("2026-09");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(1);
  });

  it("round-trips with monthKey", () => {
    for (const m of ["2026-01", "2026-12", "2025-06"]) {
      expect(monthKey(monthStart(m))).toBe(m);
    }
  });
});

describe("monthLabel", () => {
  it("lowercases the month name", () => {
    // Was "Septiembre De 2026": capitalised, and "De" capitalised too.
    expect(monthLabel("2026-09")).toBe("septiembre de 2026");
  });

  it("stays lowercase for every month", () => {
    const labels = [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ];
    labels.forEach((name, i) => {
      const month = `2026-${String(i + 1).padStart(2, "0")}`;
      expect(monthLabel(month)).toBe(`${name} de 2026`);
    });
  });

  it("renders the right year", () => {
    expect(monthLabel("2025-01")).toBe("enero de 2025");
  });
});

describe("shiftMonth", () => {
  it("moves forward and back", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("rolls the year over in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("crosses a year backwards across the leap boundary", () => {
    expect(shiftMonth("2024-03", -1)).toBe("2024-02");
  });
});
