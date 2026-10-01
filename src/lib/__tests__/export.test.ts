import { describe, expect, it } from "vitest";

import { resolvedTransactionRows } from "@/lib/export";
import { fromDateInputValue, toDateInputValue } from "@/lib/date-input";

/**
 * The CSV export and the screen must agree on what day a transaction happened.
 *
 * This is the last of the timezone bugs in ROADMAP §3.1, and the only one that
 * was ACTIVE rather than latent: `formatDate` renders in local time, so a
 * transaction at 8pm on the 31st is "31 de ago." on screen, while
 * `toISOString().slice(0, 10)` was writing `2026-09-01` into the file. On the
 * real ledger 21 of 1,115 rows were already a day off; on a month boundary the
 * export also put the row in a different MONTH than the budget counted it in.
 *
 * The fixtures below are built from local components, not from `new Date(iso)`,
 * so they mean the same thing no matter which timezone the suite runs in.
 */

const localDate = (y: number, month: number, day: number, h = 20) =>
  new Date(y, month - 1, day, h, 0, 0);

const transaction = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  date: localDate(2026, 8, 31),
  type: "expense",
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 1000,
  currency: "COP",
  destinationAmountMinor: null,
  destinationCurrency: null,
  categoryId: null,
  payeeId: null,
  description: null,
  projectTrip: null,
  notes: null,
  importBatchId: null,
  createdAt: localDate(2026, 8, 31),
  updatedAt: localDate(2026, 8, 31),
  deletedAt: null,
  ...overrides,
});

const data = (allTransactions: unknown[]) =>
  ({
    allAccounts: [],
    allCategories: [],
    allPayees: [],
    allRules: [],
    allBudgets: [],
    allTransactions,
    settingsRow: null,
  }) as unknown as Parameters<typeof resolvedTransactionRows>[0];

describe("la fecha que se exporta", () => {
  it("es la fecha local, no la de UTC", () => {
    // 31 de agosto a las 8 p. m. en UTC-5 ya es 1 de septiembre en UTC. Ese es
    // exactamente el caso que rompía: el archivo decía septiembre y la pantalla
    // decía agosto.
    const [row] = resolvedTransactionRows(data([transaction()]));

    expect(row.Fecha).toBe("2026-08-31");
    expect(row.Fecha).toBe(toDateInputValue(localDate(2026, 8, 31)));
  });

  it("no se corre de día para una transacción de madrugada", () => {
    // 1 de septiembre a las 2 a. m. en UTC+5 todavía es 31 de agosto en UTC.
    const [row] = resolvedTransactionRows(data([transaction({ date: localDate(2026, 9, 1, 2) })]));

    expect(row.Fecha).toBe("2026-09-01");
  });

  it("aguanta el último instante del mes y el primero del siguiente", () => {
    const rows = resolvedTransactionRows(
      data([
        transaction({ id: 1, date: localDate(2026, 8, 31, 23) }),
        transaction({ id: 2, date: localDate(2026, 9, 1, 0) }),
      ])
    );

    expect(rows.map((r) => r.Fecha)).toEqual(["2026-08-31", "2026-09-01"]);
  });

  it("no cambia de mes para nadie en la frontera", () => {
    // La propiedad que importa: el mes del archivo es el mismo mes que ve el
    // usuario. Si esto falla, el presupuesto y el CSV cuentan meses distintos.
    for (const [y, m, d, h] of [
      [2026, 1, 31, 22],
      [2026, 2, 28, 23],
      [2024, 2, 29, 20],
      [2026, 12, 31, 23],
    ] as const) {
      const exported = resolvedTransactionRows(data([transaction({ date: localDate(y, m, d, h) })]));
      const expected = toDateInputValue(localDate(y, m, d, h));
      expect(exported[0].Fecha, `${y}-${m}-${d} ${h}:00`).toBe(expected);
      expect(exported[0].Fecha.slice(0, 7), `${y}-${m}-${d} ${h}:00`).toBe(
        toDateInputValue(localDate(y, m, d, h)).slice(0, 7)
      );
    }
  });
});

describe("ida y vuelta con el import", () => {
  it("reimportar el archivo devuelve el mismo instante, al minuto", () => {
    // El import lee 'YYYY-MM-DD' con fromDateInputValue, que lo interpreta como
    // hora local. Si el export escribiera UTC, exportar y reimportar movería
    // cada transacción de día.
    for (const h of [0, 1, 12, 20, 23]) {
      const original = localDate(2026, 8, 31, h);
      const [row] = resolvedTransactionRows(data([transaction({ date: original })]));
      const reimported = fromDateInputValue(row.Fecha);

      expect(reimported.getFullYear(), `hora ${h}`).toBe(2026);
      expect(reimported.getMonth(), `hora ${h}`).toBe(7);
      expect(reimported.getDate(), `hora ${h}`).toBe(31);
      expect(reimported.getHours(), `hora ${h}`).toBe(0);
    }
  });
});
