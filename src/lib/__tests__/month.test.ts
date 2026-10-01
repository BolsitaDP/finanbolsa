import { describe, expect, it } from "vitest";

import { monthKey, monthLabel, monthRange, monthStart, shiftMonth } from "@/lib/month";

/**
 * `month.ts` is the module everything buckets by. It is the reason
 * `recurring.ts` and the budget page agree about which month a transaction
 * belongs to, and after ROADMAP §3.1 they do: the UTC one was the bug. Small,
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

/**
 * `monthRange` existe por una razón medible: `strftime(...) = 'YYYY-MM'` no puede
 * usar un índice, y `strftime(...) BETWEEN` sobre una columna calculada tampoco.
 * Comparar por rango produce `SEARCH transactions USING INDEX
 * transactions_date_idx (date>? AND date<?)` en vez de `SCAN transactions`.
 *
 * Los límites se calculan en hora local, así que estos tests fijan dos cosas que
 * un UTC ingenuo rompería: el primer movimiento del mes, y el último.
 */
describe("monthRange", () => {
  it("starts at local midnight of the first day", () => {
    const { start } = monthRange("2026-09");

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("ends at local midnight of the first day of the next month, exclusive", () => {
    // Exclusivo a propósito: dos meses consecutivos se tocan sin solaparse, y un
    // movimiento a medianoche cae en un mes, no en los dos.
    const { end } = monthRange("2026-09");

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(9);
    expect(end.getDate()).toBe(1);
  });

  it("crosses the year boundary correctly", () => {
    const { end } = monthRange("2026-12");
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
  });

  it("gives February its real length, in a leap year and in a common one", () => {
    // Un rango fijo de 28 días dejaría fuera el 29 de febrero; uno de 30 metería
    // el 1 de marzo. El error aparecería solo en febrero bisiesto, que es
    // justamente cuando nadie lo prueba a mano.
    expect(monthRange("2024-02").end.getDate()).toBe(1);
    expect(monthRange("2024-02").end.getMonth()).toBe(2);
    expect(monthRange("2023-02").end.getMonth()).toBe(2);
  });

  it("puts every day of the month inside the range, and nothing outside", () => {
    const { start, end } = monthRange("2026-02");
    const daysInMonth = new Date(2026, 2, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const noon = new Date(2026, 1, day, 12);
      expect(noon.getTime(), `2026-02-${day}`).toBeGreaterThanOrEqual(start.getTime());
      expect(noon.getTime(), `2026-02-${day}`).toBeLessThan(end.getTime());
    }
    expect(new Date(2026, 2, 1).getTime()).toBeGreaterThanOrEqual(end.getTime());
    expect(new Date(2026, 0, 31, 23, 59).getTime()).toBeLessThan(start.getTime());
  });

  it("puts the last instant of the month inside and the first of the next outside", () => {
    // El borde que de verdad decide: un movimiento escrito a las 11:59:59 del
    // último día pertenece a este mes, y uno a las 00:00:00 del día siguiente ya
    // no. Con UTC en lugar de hora local estos dos caen en meses distintos para
    // cualquier lector de Colombia.
    const { start, end } = monthRange("2026-01");
    const lastInstant = new Date(2026, 0, 31, 23, 59, 59, 999);
    const nextMonth = new Date(2026, 1, 1, 0, 0, 0, 0);

    expect(lastInstant.getTime()).toBeLessThan(end.getTime());
    expect(lastInstant.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(nextMonth.getTime()).toBeGreaterThanOrEqual(end.getTime());
  });

  it("agrees with monthStart, so the two are one definition", () => {
    // Si estas dos dejaran de coincidir, el filtro por rango y el bucketing
    // contarían meses distintos — que es el bug de §3.1 en otra forma.
    expect(monthRange("2026-09").start.getTime()).toBe(monthStart("2026-09").getTime());
    expect(monthRange("2026-09").end.getTime()).toBe(monthStart("2026-10").getTime());
  });
});
