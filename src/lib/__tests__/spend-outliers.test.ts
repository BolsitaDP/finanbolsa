import { describe, expect, it } from "vitest";

import {
  detectSpendOutliers,
  monthElapsedFraction,
  MAX_BASELINE_COEFFICIENT_OF_VARIATION,
  MIN_MONTHS_IN_BASELINE,
  type MonthlySpend,
} from "@/lib/spend-outliers";

/**
 * La alerta de gasto atípico existe para detectar una fuga antes de que sea
 * grande, así que lo que importa no es la aritmética sino **cuándo se calla**.
 * Una tarjeta que avisa de todo es una tarjeta que nadie lee, y esta corre todos
 * los días. Los casos que se fijan aquí son casi todos los que el detector
 * decide NO.alertar.
 */

const CURRENT = "2026-09";

/** Los seis meses anteriores a septiembre, en orden. */
const BASELINE = ["2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03"];

const row = (categoryId: string, month: string, amountMinor: number, currency = "COP"): MonthlySpend => ({
  categoryId,
  currency,
  month,
  amountMinor,
});

/** Una categoría estable con un gasto fijo cada mes de la base. */
function stable(categoryId: string, amountMinor: number, currency = "COP"): MonthlySpend[] {
  return BASELINE.map((month) => row(categoryId, month, amountMinor, currency));
}

const detect = (
  history: MonthlySpend[],
  elapsedFraction = 1,
  limit = 3
) => detectSpendOutliers(history, { currentMonth: CURRENT, baselineMonths: BASELINE, elapsedFraction, limit });

describe("monthElapsedFraction", () => {
  it("reports how much of the current month has gone by", () => {
    // Septiembre tiene 30 días: el día 15 es la mitad, y con la base prorateada
    // una categoría que va 2x por encima es 4x sobre el mes completo.
    expect(monthElapsedFraction(new Date(2026, 8, 15), "2026-09")).toBeCloseTo(0.5);
  });

  it("treats a finished month as complete", () => {
    // El mes pasado no se proratea: ya pasó entero.
    expect(monthElapsedFraction(new Date(2026, 8, 15), "2026-08")).toBe(1);
  });

  it("never returns zero, which would make the baseline zero and the ratio infinite", () => {
    // El día 1 de un mes de 31 días daría 1/31, no 0. Un cero aquí significaría
    // que hoy no hay nada registrado, no que el mes no empezó.
    expect(monthElapsedFraction(new Date(2026, 9, 1), "2026-10")).toBeCloseTo(1 / 31);
  });

  it("handles February without assuming 30 days", () => {
    expect(monthElapsedFraction(new Date(2024, 1, 15), "2024-02")).toBeCloseTo(15 / 29);
  });
});

describe("detectSpendOutliers", () => {
  it("flags a category running well past its own average", () => {
    const history = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 650_000)];

    const [outlier] = detect(history);

    expect(outlier).toEqual({
      categoryId: "cat-compras",
      currency: "COP",
      current: 650_000,
      baseline: 200_000,
      ratio: 3.25,
      monthsInBaseline: 6,
    });
  });

  it("catches a runaway mid-month instead of waiting for the month to end", () => {
    // El caso que la prorata resuelve. El día 15 esta categoría lleva 650.000
    // contra una base de 200.000: 3,25x sobre un mes completo, que es el mismo
    // número que daría el día 30. Sin proratear, la alerta no saltaría hasta
    // que ya se hubiera gastado los 200.000 enteros — o no saltaría nunca, si el
    // mes se acabara antes. Lo que se busca es la fuga a tiempo para actuar.
    const history = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 650_000)];

    const [outlier] = detect(history, 0.5);
    expect(outlier.ratio).toBeCloseTo(6.5);
  });

  it("stays quiet early in the month on a normal pace of spending", () => {
    // El día 3, 50.000 llevados contra una base prorateada de 200.000/10 =
    // 20.000 son 2,5x: por debajo del umbral. Un mes que va normal no puede
    // marcarse como anomalía ni el día 3 ni el día 20.
    const history = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 50_000)];

    expect(detect(history, 3 / 30)).toEqual([]);
    expect(detect(history, 20 / 30)).toEqual([]);
  });

  it("treats exactly three times the average as not yet an anomaly", () => {
    // El límite es deliberadamente estricto. 3,00x es indistinguible de 2,99x, y
    // una tarjeta que se enciende en la frontera se enciende siempre.
    const atThreshold = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 600_000)];
    const justOver = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 620_000)];

    expect(detect(atThreshold, 1)).toEqual([]);
    expect(detect(justOver, 1)[0].ratio).toBeCloseTo(3.1);
  });

  it("flags the same spend on the last day of the month", () => {
    // Al día 30 no hay nada que proratear: 650.000 contra una base de 200.000 es
    // 3,25x de verdad.
    const history = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 650_000)];

    expect(detect(history, 1)[0].ratio).toBeCloseTo(3.25);
  });

  it("does not flag a month that is simply on its usual path", () => {
    // La mitad de lo de siempre no es una anomalía, por más que el mes vaya por
    // la mitad del calendario.
    const history = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 200_000)];

    expect(detect(history, 0.5)).toEqual([]);
  });

  it("stays quiet on a small rise, which the month-over-month card already covers", () => {
    // +100% es enorme como porcentaje y no es una fuga. Con una base de 200.000
    // son 200.000 pesos, y la tarjeta de al lado ya lo dice.
    const history = [...stable("cat-compras", 200_000), row("cat-compras", CURRENT, 400_000)];

    expect(detect(history)).toEqual([]);
  });

  it("ignores a category that is irregular by nature", () => {
    // "Reparaciones": 0 un mes, 500.000 otro, 0 otro. El promedio da 166.666 y
    // cualquier mes normal parecería una anomalía. Con un tope de variación en
    // la base, esta categoría no genera alertas — y no debería: un pico aquí es
    // lo esperado, no una fuga.
    const irregular = BASELINE.map((month, i) =>
      row("cat-reparaciones", month, i === 2 ? 500_000 : i === 4 ? 400_000 : 0)
    );
    const history = [...irregular, row("cat-reparaciones", CURRENT, 200_000)];

    expect(detect(history)).toEqual([]);
  });

  it("accepts a category whose baseline wobbles a little", () => {
    // Un poco de varianza es normal — un temporal, un cumpleaños. El tope tiene
    // que dejar pasar esto, o la tarjeta solo alertaría de los promedios
    // exactos, que no existen.
    const wobbling = BASELINE.map((month, i) =>
      row("cat-transporte", month, [180_000, 220_000, 200_000, 190_000, 210_000, 200_000][i])
    );
    const history = [...wobbling, row("cat-transporte", CURRENT, 800_000)];

    const [outlier] = detect(history);
    expect(outlier.monthsInBaseline).toBe(6);
    expect(outlier.ratio).toBeGreaterThan(3);
  });

  it("needs at least three months of history, not one", () => {
    // Contra un solo mes anterior, cualquier mes distinto parece una anomalía.
    // Un mes nuevo de comida no es una fuga; cuatro sí.
    const thin = [
      row("cat-compras", "2026-08", 200_000),
      row("cat-compras", "2026-07", 200_000),
      row("cat-compras", CURRENT, 900_000),
    ];

    expect(detect(thin)).toEqual([]);
    expect(MIN_MONTHS_IN_BASELINE).toBe(3);
  });

  it("ignores months with no spend when counting history", () => {
    // Una categoría que se usó cinco meses y lleva uno sin gastar tiene cinco
    // meses de base, no seis. Contar el mes en cero bajaría el promedio y
    // dispararía la alerta sin motivo.
    const history = [
      row("cat-compras", "2026-08", 200_000),
      row("cat-compras", "2026-07", 200_000),
      row("cat-compras", "2026-06", 200_000),
      row("cat-compras", "2026-05", 200_000),
      row("cat-compras", "2026-04", 0),
      row("cat-compras", "2026-03", 200_000),
      row("cat-compras", CURRENT, 900_000),
    ];

    expect(detect(history)[0].monthsInBaseline).toBe(5);
  });

  it("ignores months outside the requested window", () => {
    // La ventana es explícita porque un gasto de hace dos años no es la base de
    // "cuánto gasto normalmente": las categorias cambian.
    const history = [
      ...stable("cat-compras", 200_000),
      row("cat-compras", "2025-01", 1_000_000),
      row("cat-compras", "2025-02", 1_200_000),
      row("cat-compras", CURRENT, 900_000),
    ];

    expect(detect(history)[0].monthsInBaseline).toBe(6);
  });

  it("stays quiet for a category with no spending this month", () => {
    // No gastar en una categoría es lo contrario de una anomalía, y aun así
    // tendría que aparecer en la lista de "gasto fuera de lo normal" para
    // reviewarse: no.
    const history = [...stable("cat-compras", 200_000)];

    expect(detect(history)).toEqual([]);
  });

  it("never compares two currencies against each other", () => {
    // La misma categoría en dos monedas son dos comparaciones con dos bases.
    // Sumarlas daría un promedio que no le corresponde a ninguna de las dos: con
    // 200.000 COP + 50 USD de base, un mes de 900.000 COP + 200 USD daría un
    // único "3,99x" que no describe ninguno de los dos casos.
    const history = [
      ...stable("cat-viajes", 200_000),
      ...stable("cat-viajes", 50, "USD"),
      row("cat-viajes", CURRENT, 900_000),
      row("cat-viajes", CURRENT, 200, "USD"),
    ];

    const outliers = detect(history);

    expect(outliers).toHaveLength(2);
    expect(outliers.map((o) => o.currency).sort()).toEqual(["COP", "USD"]);
    // 4,0x en dólares contra 4,5x en pesos, no un único número mezclado.
    expect(outliers.map((o) => o.ratio).sort((a, b) => a - b)).toEqual([4, 4.5]);
  });

  it("ranks by the excess over the baseline, not by the ratio", () => {
    // 3,2x sobre una base de 400.000 son 880.000 de sobra. 8x sobre una base de
    // 20.000 son 140.000. El ratio pone al segundo primero y esconde la fuga
    // grande, que es la que importa.
    const history = [
      ...stable("cat-chico", 20_000),
      row("cat-chico", CURRENT, 160_000),
      ...stable("cat-grande", 400_000),
      row("cat-grande", CURRENT, 1_280_000),
    ];

    expect(detect(history).map((o) => o.categoryId)).toEqual(["cat-grande", "cat-chico"]);
  });

  it("caps the list so one bad month cannot bury the page", () => {
    const history = BASELINE.flatMap((month) => [
      ...stable("cat-a", 100_000).filter((r) => r.month === month),
      ...stable("cat-b", 100_000).filter((r) => r.month === month),
      ...stable("cat-c", 100_000).filter((r) => r.month === month),
      row("cat-a", month, 0),
      row("cat-b", month, 0),
      row("cat-c", month, 0),
    ]);
    const current = [row("cat-a", CURRENT, 900_000), row("cat-b", CURRENT, 900_000), row("cat-c", CURRENT, 900_000)];

    expect(detect([...history, ...current], 1, 2)).toHaveLength(2);
  });

  it("returns nothing when the window has no history at all", () => {
    expect(detect([row("cat-compras", CURRENT, 900_000)])).toEqual([]);
  });

  it("keeps the variation ceiling explicit rather than incidental", () => {
    // Fijado como constante exportada porque el valor es una decisión de producto
    // ("qué es irregular para una categoría"), no un número que salió de un
    // ajuste. Si algún día cambia, este test obliga a pensarlo.
    expect(MAX_BASELINE_COEFFICIENT_OF_VARIATION).toBe(0.6);
  });
});
