import { describe, expect, it } from "vitest";

import { summarizeMonth, type MonthSummary } from "@/lib/month-summary";

/**
 * The phrasing rules of "a dónde fue mi plata".
 *
 * Every case here is one the summary can get embarrassingly wrong: a percentage
 * that is mathematically undefined, a first month with nothing to compare, a
 * category that vanished. A wrong number in a sentence is worse than a wrong
 * number in a table, because nobody checks a sentence.
 */

const base: MonthSummary = {
  currentLabel: "agosto de 2026",
  previousLabel: "julio de 2026",
  currency: "COP",
  currentTotal: 1_000_000,
  previousTotal: 800_000,
  topIncrease: { name: "Nightclub", amountMinor: 180_000 },
  topDecrease: { name: "Renta", amountMinor: -50_000 },
};

describe("summarizeMonth", () => {
  it("says the amount, the comparison and the biggest cause in one sentence", () => {
    const text = summarizeMonth(base);

    expect(text).toContain("agosto de 2026");
    expect(text).toContain("$ 1.000.000 COP");
    expect(text).toContain("julio de 2026");
    expect(text).toContain("25%");
    expect(text).toContain("más");
    expect(text).toContain("Nightclub");
    expect(text).toContain("+$ 180.000");
  });

  it("names only one cause, because a sentence is not a list", () => {
    // The card below the sentence already lists every category. Repeating them
    // here would bury the one thing worth reading.
    const text = summarizeMonth(base);
    expect(text).not.toContain("Renta");
  });

  it("says 'menos' when spending went down, and does not call it an increase", () => {
    const text = summarizeMonth({
      ...base,
      currentTotal: 600_000,
      previousTotal: 800_000,
      topIncrease: null,
      topDecrease: { name: "Renta", amountMinor: -200_000 },
    });

    expect(text).toContain("25% menos");
    expect(text).toContain("Lo que más bajó fue Renta");
    expect(text).not.toContain("mayor incremento");
  });

  it("never divides by zero: a first month has no percentage", () => {
    // previousTotal = 0 makes the percentage mathematically infinite. Saying
    // "Infinity% más" would be the worst possible output here.
    const text = summarizeMonth({ ...base, previousTotal: 0, topIncrease: null, topDecrease: null });

    expect(text).toContain("No hay mes anterior con qué comparar");
    expect(text).not.toContain("%");
    expect(text).not.toContain("Infinity");
    expect(text).not.toContain("NaN");
  });

  it("handles a month with no spending at all", () => {
    const text = summarizeMonth({
      ...base,
      currentTotal: 0,
      previousTotal: 500_000,
      topIncrease: null,
      topDecrease: null,
    });

    expect(text).toContain("No gastaste nada");
    expect(text).not.toContain("-100%");
  });

  it("handles two empty months without inventing a comparison", () => {
    const text = summarizeMonth({
      ...base,
      currentTotal: 0,
      previousTotal: 0,
      topIncrease: null,
      topDecrease: null,
    });

    expect(text).toContain("No hubo gasto");
    expect(text).not.toContain("%");
  });

  it("reports an identical month as identical, not as a rounding coincidence", () => {
    const text = summarizeMonth({
      ...base,
      currentTotal: 800_000,
      previousTotal: 800_000,
      topIncrease: null,
      topDecrease: null,
    });

    expect(text).toContain("exactamente igual");
  });

  it("omits the percentage but keeps the direction when the base is tiny", () => {
    // A percentage against 1 peso is technically computable and completely
    // useless. The peso amount still tells the truth, so keep that.
    const text = summarizeMonth({
      ...base,
      currentTotal: 100,
      previousTotal: 1,
      topIncrease: null,
      topDecrease: null,
    });

    expect(text).toContain("$ 100 COP");
    expect(text).toContain("más");
  });

  it("does not claim a change it cannot see when the mover rounds to nothing", () => {
    const text = summarizeMonth({
      ...base,
      currentTotal: 800_000,
      previousTotal: 800_000,
      topIncrease: { name: "Café", amountMinor: 0 },
      topDecrease: null,
    });

    expect(text).toContain("exactamente igual");
    expect(text).not.toContain("Café");
  });

  it("formats with the es-CO thousands separator, not an English one", () => {
    // 1.234.567 in es-CO; 1,234,567 would be a different number to a Colombian
    // reader, and the app formats every other amount the same way.
    const text = summarizeMonth({
      ...base,
      currentTotal: 1_234_567,
      previousTotal: 1_000_000,
      topIncrease: null,
      topDecrease: null,
    });

    expect(text).toContain("$ 1.234.567 COP");
    expect(text).not.toContain("1,234,567");
  });
});
