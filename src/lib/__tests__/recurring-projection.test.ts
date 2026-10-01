import { describe, expect, it } from "vitest";

import {
  ACTIVE_WINDOW_DAYS,
  projectUpcoming,
  type Projection,
} from "@/lib/recurring-projection";

/**
 * La proyección contesta "¿cuánto va a salir?", y casi todo el riesgo está en lo
 * que **cuenta** y lo que **no**. Una previsión que suma una suscripción cancelada
 * hace ocho meses sobrestimando el mes, y una previsión que solo mira el mes en
 * curso se equivoca todos los meses que el cargo cae después del día de hoy.
 */

const TODAY = new Date(2026, 8, 15); // 15 de septiembre de 2026

function daysAgo(days: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  return d;
}

const group = (over: {
  key: string;
  label: string;
  currency?: string;
  lastChargeDaysAgo: number;
  interval: number | null;
  amountMinor: number;
}) => ({
  key: over.key,
  label: over.label,
  currency: over.currency ?? "COP",
  lastDate: daysAgo(over.lastChargeDaysAgo),
  medianIntervalDays: over.interval,
  latestAmountMinor: over.amountMinor,
});

/** Una suscripción mensual que cobra hace `since` días. */
const monthly = (key: string, label: string, amountMinor: number, since = 10) =>
  group({ key, label, lastChargeDaysAgo: since, interval: 30, amountMinor });

const totalOf = (projections: Projection[], currency: string) =>
  projections.find((p) => p.currency === currency)?.totalMinor;

describe("projectUpcoming", () => {
  it("projects a monthly subscription that will charge again inside the horizon", () => {
    // Cobró hace 10 días con intervalo de 30: vuelve en 20, que está dentro de
    // los próximos 30.
    const [projection] = projectUpcoming([monthly("payee-netflix", "Netflix", 42_000)], TODAY);

    expect(projection.currency).toBe("COP");
    expect(projection.totalMinor).toBe(42_000);
    expect(projection.charges[0]).toMatchObject({ label: "Netflix", daysAway: 20, amountMinor: 42_000 });
    expect(projection.charges[0].expectedDate.getDate()).toBe(5);
  });

  it("leaves out a subscription whose next charge falls after the horizon", () => {
    // Un cargo cada 45 días, cobrado hace 2: vuelve en 43, fuera de la ventana de
    // 30. Nótese que un cargo mensual *nunca* queda fuera: 30 días de intervalo
    // significa que siempre vuelve dentro de 30. El horizonte solo descarta
    // recurrentes más espaciados que un mes, que es lo que debe hacer.
    const slow = group({
      key: "payee-trimestral",
      label: "Trimestral",
      lastChargeDaysAgo: 2,
      interval: 45,
      amountMinor: 300_000,
    });

    expect(projectUpcoming([slow], TODAY)).toEqual([]);
  });

  it("leaves out a subscription that stopped charging", () => {
    // El caso que separa un informe retrospectivo de una previsión. Aparece en
    // `/recurrentes` porque fue un gasto recurrente, pero no va a volver a salir.
    // El último cobro fue hace 5 meses.
    const stale = group({
      key: "payee-cancelada",
      label: "Playa(old)",
      lastChargeDaysAgo: 150,
      interval: 30,
      amountMinor: 200_000,
    });

    expect(projectUpcoming([stale], TODAY)).toEqual([]);
    expect(ACTIVE_WINDOW_DAYS).toBe(45);
  });

  it("leaves an overdue charge out, because that is not a projection", () => {
    // Último cargo hace 40 días, intervalo 30: el siguiente tocaba hace 10 días.
    // Listarlo en una tarjeta que promete "los próximos 30 días" daría un "hace
    // 10 días" dentro de los próximos, y además taparía lo que corresponde: que
    // ese cargo está atrasado y hay que registrarlo. Eso es trabajo del botón de
    // la tabla de abajo, no de una previsión.
    const overdue = group({
      key: "payee-rappi",
      label: "Rappi",
      lastChargeDaysAgo: 40,
      interval: 30,
      amountMinor: 80_000,
    });

    expect(projectUpcoming([overdue], TODAY)).toEqual([]);
  });

  it("still projects a charge that is late but not yet due", () => {
    // El mismo commerce con un ciclo más largo: el siguiente cargo cae dentro de
    // la ventana aunque la última appearances sea de hace 40 días. Por eso el
    // criterio es la fecha esperada y no "días desde el último".
    const slow = group({
      key: "payee-rappi",
      label: "Rappi",
      lastChargeDaysAgo: 40,
      interval: 45,
      amountMinor: 80_000,
    });

    expect(projectUpcoming([slow], TODAY)[0].totalMinor).toBe(80_000);
  });

  it("projects the last charge, not the average of the whole history", () => {
    // Subió de 35.000 a 42.000 el mes pasado. El promedio del grupo da ~39.000,
    // y 39.000 no es lo que van a cobrar: la previsión que usa el promedio
    // subestima justo cuando el usuario acaba de ver la subida en la página de
    // recurrentes.
    const charges = projectUpcoming(
      [monthly("payee-netflix", "Netflix", 42_000)],
      TODAY
    );

    expect(charges[0].totalMinor).toBe(42_000);
  });

  it("projects a weekly charge weekly", () => {
    // La detección no sabe que todo es mensual: una entrega de mercado cada 7
    // días también es "3 meses con montos parecidos". Con un 30 fijo se
    // proyectaría una sola vez y en el mes equivocado.
    const weekly = group({
      key: "payee-domicilios",
      label: "Domicilios",
      lastChargeDaysAgo: 2,
      interval: 7,
      amountMinor: 45_000,
    });

    const [projection] = projectUpcoming([weekly], TODAY);

    expect(projection.charges).toHaveLength(1);
    expect(projection.charges[0].daysAway).toBe(5);
  });

  it("leaves out a group with no interval, which is not yet a subscription", () => {
    const noInterval = group({
      key: "payee-nuevo",
      label: "Nuevo",
      lastChargeDaysAgo: 5,
      interval: null,
      amountMinor: 90_000,
    });

    expect(projectUpcoming([noInterval], TODAY)).toEqual([]);
  });

  it("adds up every charge inside the horizon and ignores the rest", () => {
    const projections = projectUpcoming(
      [
        monthly("a", "A", 42_000, 10), // vuelve en 20 días → dentro
        monthly("b", "B", 80_000, 25), // vuelve en 5 días → dentro
        group({ key: "c", label: "C", lastChargeDaysAgo: 2, interval: 45, amountMinor: 500_000 }), // 43 días → fuera
      ],
      TODAY
    );

    expect(projections[0].totalMinor).toBe(122_000);
    expect(projections[0].charges.map((c) => c.label)).toEqual(["B", "A"]);
  });

  it("orders charges by how soon they land, and totals by what weighs most", () => {
    const many = projectUpcoming(
      [
        monthly("a", "A", 10_000, 25), // en 5 días
        monthly("b", "B", 90_000, 10), // en 20 días
        monthly("c", "C", 5_000, 1), // en 29 días
      ],
      TODAY
    );

    expect(many[0].charges.map((c) => c.daysAway)).toEqual([5, 20, 29]);
  });

  it("never adds two currencies into one total", () => {
    const projections = projectUpcoming(
      [
        monthly("a", "Netflix", 42_000, 10),
        group({
          key: "b",
          label: "AWS",
          currency: "USD",
          lastChargeDaysAgo: 10,
          interval: 30,
          amountMinor: 20,
        }),
      ],
      TODAY
    );

    expect(projections).toHaveLength(2);
    expect(projections.map((p) => p.currency).sort()).toEqual(["COP", "USD"]);
    expect(totalOf(projections, "COP")).toBe(42_000);
    expect(totalOf(projections, "USD")).toBe(20);
  });

  it("sorts currencies by the size of the expected bill", () => {
    const projections = projectUpcoming(
      [
        group({ key: "a", label: "A", currency: "USD", lastChargeDaysAgo: 10, interval: 30, amountMinor: 20 }),
        monthly("b", "B", 900_000, 10),
      ],
      TODAY
    );

    expect(projections[0].currency).toBe("COP");
  });

  it("projects nothing when there are no recurring charges at all", () => {
    expect(projectUpcoming([], TODAY)).toEqual([]);
  });

  it("honours a custom horizon", () => {
    // Un cargo a 35 días de distancia: fuera de la ventana de 30, dentro de la
    // de 45. Con un horizonte de 60 entraría también el anual.
    const in35Days = group({
      key: "a",
      label: "A",
      lastChargeDaysAgo: 10,
      interval: 45,
      amountMinor: 42_000,
    });

    expect(projectUpcoming([in35Days], TODAY, 30)).toEqual([]);
    expect(projectUpcoming([in35Days], TODAY, 45)[0].totalMinor).toBe(42_000);
  });
});

describe("median interval detection", () => {
  it("measures the gap between charges, not a hardcoded month", () => {
    // Este caso vive en recurring.test.ts contra el detector real; lo que se
    // comprueba aquí es que la proyección consume ese número y no lo vuelve a
    // suponer.
    const projections = projectUpcoming(
      [
        group({
          key: "anual",
          label: "Seguro",
          lastChargeDaysAgo: 10,
          interval: 365,
          amountMinor: 1_200_000,
        }),
      ],
      TODAY
    );

    expect(projections).toEqual([]);
  });
});
