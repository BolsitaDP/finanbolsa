import { describe, expect, it } from "vitest";

import { buildCategoryDeltas } from "@/components/month-over-month";
import type { CategoryMonthTotal } from "@/lib/aggregates";

/**
 * The comparison card answers "¿en qué gasté más?", so what matters is the
 * ORDER and the SIGN of the deltas, not just their arithmetic. A category that
 * stopped being spent on has to show up (negative) and a brand new one has to
 * show up too, even though there is no percentage to compute for it.
 */

const entry = (categoryId: string, currency: string, amountMinor: number): CategoryMonthTotal => ({
  categoryId,
  currency,
  amountMinor,
});

describe("buildCategoryDeltas", () => {
  it("sorts by the biggest increase first, since that is the question being asked", () => {
    const deltas = buildCategoryDeltas(
      [
        entry("mercado", "COP", 100_000),
        entry("transporte", "COP", 500_000),
        entry("cine", "COP", 200_000),
      ],
      [
        entry("mercado", "COP", 100_000),
        entry("transporte", "COP", 100_000),
        entry("cine", "COP", 100_000),
      ],
      10
    );

    expect(deltas.map((d) => d.categoryId)).toEqual(["transporte", "cine", "mercado"]);
    expect(deltas[0].delta).toBe(400_000);
  });

  it("keeps a category that stopped being spent on, as a negative", () => {
    // Dropping a subscription is a real answer to the question. Omitting it would
    // make total spending look like it only ever goes up.
    const deltas = buildCategoryDeltas(
      [entry("mercado", "COP", 100_000)],
      [entry("mercado", "COP", 100_000), entry("netflix", "COP", 60_000)],
      10
    );

    const netflix = deltas.find((d) => d.categoryId === "netflix");
    expect(netflix).toBeDefined();
    expect(netflix!.current).toBe(0);
    expect(netflix!.previous).toBe(60_000);
    expect(netflix!.delta).toBe(-60_000);
  });

  it("treats a brand new category as a full increase, with no percentage to divide by", () => {
    const deltas = buildCategoryDeltas(
      [entry("gimnasio", "COP", 250_000)],
      [entry("mercado", "COP", 100_000)],
      10
    );

    const gym = deltas.find((d) => d.categoryId === "gimnasio");
    expect(gym).toBeDefined();
    expect(gym!.previous).toBe(0);
    expect(gym!.delta).toBe(250_000);
  });

  it("never mixes currencies into one comparison", () => {
    // The same category in two currencies is two lines, not one sum. A dollar
    // added to pesos is not a peso.
    const deltas = buildCategoryDeltas(
      [entry("mercado", "COP", 100_000), entry("mercado", "USD", 50)],
      [entry("mercado", "COP", 100_000), entry("mercado", "USD", 20)],
      10
    );

    expect(deltas).toHaveLength(2);
    expect(deltas.map((d) => d.delta).sort()).toEqual([0, 30]);
  });

  it("reports an unchanged category as zero rather than dropping it", () => {
    const deltas = buildCategoryDeltas(
      [entry("mercado", "COP", 100_000)],
      [entry("mercado", "COP", 100_000)],
      10
    );

    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta).toBe(0);
  });

  it("returns nothing when neither month had any spend", () => {
    expect(buildCategoryDeltas([], [], 8)).toEqual([]);
  });

  it("caps the list at the requested limit", () => {
    const current = Array.from({ length: 20 }, (_, i) => entry(`cat-${i}`, "COP", (i + 1) * 1000));
    const previous = Array.from({ length: 20 }, (_, i) => entry(`cat-${i}`, "COP", 0));

    expect(buildCategoryDeltas(current, previous, 5)).toHaveLength(5);
  });
});
