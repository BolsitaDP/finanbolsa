import { describe, expect, it } from "vitest";

import { buildPayeeDeltas } from "@/components/top-payees";
import type { PayeeMonthTotal } from "@/lib/aggregates";

/**
 * El ranking de comercios responde "¿a quién le gasté más?", así que lo que
 * importa es el orden, el signo del delta, y sobre todo no mezclar monedas: un
 * comercio que aparece en pesos y en dólares son dos líneas, y sumar un dólar a
 * un peso produciría un ranking ordenado por un número que no existe.
 *
 * La lógica compartida vive en `buildDeltas` y ya está cubierta por
 * month-over-month.test.ts. Lo que se prueba aquí es el envoltura: que agrupe
 * por comercio y no por otra cosa.
 */

const entry = (payeeId: string, currency: string, amountMinor: number): PayeeMonthTotal => ({
  payeeId,
  currency,
  amountMinor,
});

describe("buildPayeeDeltas", () => {
  it("orders by the biggest increase, not by this month's total", () => {
    // El Supermercado gastó más este mes en total, pero Rappi es lo que más
    // subió: la pregunta de la tarjeta es "¿qué cambió?", no "¿qué es más
    // grande?".
    const deltas = buildPayeeDeltas(
      [
        entry("payee-rappi", "COP", 400_000),
        entry("payee-supermercado", "COP", 500_000),
      ],
      [
        entry("payee-rappi", "COP", 100_000),
        entry("payee-supermercado", "COP", 480_000),
      ],
      5
    );

    expect(deltas.map((d) => d.payeeId)).toEqual(["payee-rappi", "payee-supermercado"]);
    expect(deltas[0].delta).toBe(300_000);
    expect(deltas[1].delta).toBe(20_000);
  });

  it("keeps a merchant that stopped appearing, as a negative", () => {
    // Dejar de ir a un sitio es una respuesta. Omitirlo haría que el gasto total
    // solo pudiera subir, que es justo lo que la tarjeta no debe insinuar.
    const deltas = buildPayeeDeltas(
      [entry("payee-rappi", "COP", 200_000)],
      [entry("payee-rappi", "COP", 200_000), entry("payee-cine", "COP", 90_000)],
      5
    );

    const cine = deltas.find((d) => d.payeeId === "payee-cine");
    expect(cine).toBeDefined();
    expect(cine!.current).toBe(0);
    expect(cine!.previous).toBe(90_000);
    expect(cine!.delta).toBe(-90_000);
  });

  it("never mixes currencies into one ranking", () => {
    const deltas = buildPayeeDeltas(
      [entry("payee-rappi", "COP", 100_000), entry("payee-rappi", "USD", 50)],
      [entry("payee-rappi", "COP", 100_000), entry("payee-rappi", "USD", 20)],
      5
    );

    expect(deltas).toHaveLength(2);
    expect(deltas.map((d) => d.delta).sort()).toEqual([0, 30]);
  });

  it("treats a merchant new to the app as a full increase", () => {
    const deltas = buildPayeeDeltas(
      [entry("payee-nuevo", "COP", 75_000)],
      [entry("payee-rappi", "COP", 100_000)],
      5
    );

    const nuevo = deltas.find((d) => d.payeeId === "payee-nuevo");
    expect(nuevo).toBeDefined();
    expect(nuevo!.previous).toBe(0);
    expect(nuevo!.delta).toBe(75_000);
  });

  it("caps the list at the requested limit", () => {
    const current = Array.from({ length: 12 }, (_, i) => entry(`payee-${i}`, "COP", (i + 1) * 1000));
    const previous = Array.from({ length: 12 }, (_, i) => entry(`payee-${i}`, "COP", 0));

    expect(buildPayeeDeltas(current, previous, 5)).toHaveLength(5);
  });

  it("returns nothing when neither month had a merchant to rank", () => {
    expect(buildPayeeDeltas([], [], 5)).toEqual([]);
  });
});
